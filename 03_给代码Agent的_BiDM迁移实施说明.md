# 任务说明：把 BiDM 的可迁移机制接入现有 BNN

你是一名负责修改现有 BNN 代码仓库的代码 Agent。请先审计工程，再增量实现，不要在不了解任务结构时直接照搬扩散模型代码。

## 1. 目标

在不破坏现有 BNN baseline 和推理接口的前提下，实现并验证以下功能：

1. **Learnable Dynamic Activation Scaling（优先、必须）**：参考 BiDM TBS 中的可学习 `k`，用量化前激活的绝对值通道均值生成输入相关的空间尺度；
2. **Space Patched Distillation（优先、必须）**：对浮点 teacher 与二值 student 的中间特征做局部分块关系蒸馏；
3. **Cross-step Feature Compensation（条件实现）**：仅当仓库中的模型存在 timestep、迭代状态、连续帧或可对齐的相邻 step 时实现；普通单次前向 CNN 不得硬套。

最终必须提供可关闭的配置项、消融实验入口、单元测试/数值检查、复杂度与兼容性说明。

## 2. 开始编码前必须完成的仓库审计

请先输出一份简短审计报告，列出文件路径和符号名：

- 训练入口、配置系统、模型构建入口；
- 所有二值权重/激活量化器、STE、自定义 autograd；
- 二值卷积/线性层封装，是否已有 weight/activation scaling；
- 网络 backbone、可作为 distillation feature 的 blocks；
- loss 聚合和 teacher/student 训练逻辑；
- 推理/导出/部署路径，是否真的使用 XNOR/bitcount kernel；
- 现有测试、benchmark 和 baseline checkpoint；
- 是否存在 timestep/state/frame 参数与跨步缓存。

若不存在浮点 teacher/checkpoint、没有可对齐中间特征，或 baseline 无法复现，请明确报告，不要静默构造错误实现。

## 3. 功能 A：可学习动态激活缩放

### 3.1 目标计算

对输入 `x: [N, C, H, W]`：

```python
x_sign = sign_ste(x)
scale_map = mean(abs(x), dim=1, keepdim=True)
scale_map = conv2d(scale_map, k, padding="same")
y_binary = binary_conv(x_sign, sign_ste(weight))
y = y_binary * scale_map * weight_scale
```

要求：

- `k` 默认 3×3、输入/输出通道均为 1；
- 初始化为均值滤波核（每个元素 `1/9`），便于从 XNOR 缩放起点训练；
- 提供 `learnable=False`，用于固定均值核消融；
- `scale_map` 的空间尺寸必须与二值卷积输出匹配；stride、padding、dilation 不同的层需正确处理，不能依赖偶然 shape；
- 支持 AMP/DDP、checkpoint save/load 和现有设备/dtype；
- 不改变现有 `sign_ste` 的反向定义，除非仓库审计证明必须修改；
- 避免无意把主卷积改回浮点。若当前仓库只模拟二值卷积，要在文档中如实说明。

### 3.2 数值与安全细节

- 评估 scale 是否需要 `abs`、`softplus` 或 clamp 保证非负；首选保留论文语义并通过实验决定；
- 对全零输入、极小尺度、非有限值增加测试；
- scale 路径累积建议至少使用 FP32，输出再转换到目标 dtype；
- 若模型含 BatchNorm/LayerNorm，检查缩放插入点，避免同一幅值被归一化立即抵消；
- 记录新增参数量、浮点 FLOPs 和延迟。

### 3.3 配置建议

```yaml
quant:
  dynamic_activation_scale:
    enabled: false
    learnable: true
    kernel_size: 3
    init: mean_filter
    enforce_positive: false
    target_layers: []  # 空表示由现有规则选择；必须打印实际命中层
```

## 4. 功能 B：Space Patched Distillation

### 4.1 接口

实现独立 loss，例如：

```python
loss = space_patched_distillation(
    student_features,
    teacher_features,
    patch_grid=2,
    eps=1e-6,
    reduction="mean",
)
```

输入可为单个 tensor 或按 block 名索引的映射。teacher 必须 `eval()` 且 `requires_grad=False`/`no_grad()`；student 保留梯度。

### 4.2 算法

对每个对齐的 `[N,C,H,W]` 特征：

1. 切成 `p × p` 个非重叠 patch；
2. 对每个 patch reshape 为论文语义一致的二维表示；
3. 构造局部关系矩阵 `A = P @ P.T`；
4. 对 teacher/student 的 `A` 做 L2 归一化（带 `eps`）；
5. 计算对应 patch 的 L2/Frobenius 距离并求均值；
6. 多 block loss 求均值或使用显式 block weights。

注意：论文 PDF 的公式排版不能替代 shape 推导。实现前请在代码注释/测试中明确 `P` 的维度及 `A` 是空间×空间还是通道×通道关系，并以论文官方代码（若仓库允许联网获取）或维度一致性验证最终选择。不要构造会导致 `HW × HW` 内存爆炸的实现；必要时分块、降低 patch 尺寸或采用等价 batch matmul。

### 4.3 对齐策略

- 默认只选 2–4 个高分辨率或语义关键 block，不 hook 所有层；
- teacher/student shape 完全相同时直接计算；
- channel 不同时仅在配置允许时加入 1×1 projection，并单独计入参数量；
- spatial shape 不同时使用明确配置的 resize 策略，并记录插值方式；
- H/W 不能整除 patch grid 时默认报清晰错误，或提供显式 `pad/crop` 配置，禁止静默截断。

### 4.4 总损失

```python
total_loss = task_loss + lambda_spd * spd_loss
```

不要把论文正文的默认 `λ=4` 直接当作本任务最优值。至少支持 `{0, 1e-3, 1e-2, 1e-1, 1}` 搜索；记录 task loss 与 SPD loss 的原始量级及加权后量级。

配置建议：

```yaml
distill:
  spd:
    enabled: false
    lambda: 0.01
    patch_grid: 2
    eps: 1.0e-6
    feature_layers: []
    layer_weights: {}
    projection: false
```

## 5. 功能 C：跨 step 特征补偿（条件实现）

先验证相邻 step 对应 block 的 cosine similarity，并输出统计/热图数据。只有平均相似度明显高且 shape 对齐时，才实现：

```python
fused = (1 - alpha) * current_feature + alpha * adjacent_feature
```

要求：

- `alpha` 可学习，建议用 sigmoid 参数化到 `[0,1]`，初始化等效值 0.3；若为忠实复现而不约束，需说明；
- 每个目标 block 可有独立 `alpha`；是否按 timestep 独立需结合内存规模决定；
- 明确方向和调度顺序，不能混淆论文中的 `t` 与 `t-1`；
- 推理缓存必须在每个 sample/sequence 开始时清空，禁止 batch 间泄漏；
- 处理首个 step、classifier-free guidance 双分支、DDP 和 batch size 变化；
- 报告缓存显存、训练时间和真实推理延迟。

若仓库没有 step/state，输出“not applicable”并停止该功能，不要用相邻层假冒 timestep；如希望探索相邻层融合，应作为独立实验命名。

## 6. 测试与验收标准

### 6.1 单元测试

- 动态缩放层输入/输出 shape、梯度有限且非零；
- `learnable=False` 时 `k` 无梯度，`learnable=True` 时有梯度；
- mean-filter 初始化结果与参考实现一致；
- SPD 对完全相同特征近似为 0，对扰动特征大于 0；
- SPD 在零特征、不同 batch size、AMP 下无 NaN/Inf；
- patch 不可整除时行为符合配置；
- 配置关闭后输出与原 baseline 在容差内一致；
- checkpoint 向前/向后兼容策略明确。

### 6.2 最小训练 smoke test

- 固定小数据和随机种子，baseline 与新功能各运行若干 step；
- loss 可下降、无梯度爆炸、显存不持续增长；
- teacher 确认无梯度；
- 打印实际 hook 层、各 loss 分量、scale/alpha 分布。

### 6.3 消融实验

| ID | Dynamic k | SPD | Cross-step | 说明 |
|---|:---:|:---:|:---:|---|
| E0 |  |  |  | 当前 BNN baseline |
| E1 | ✓ |  |  | 范围恢复 |
| E2 |  | ✓ |  | 局部关系蒸馏 |
| E3 | ✓ | ✓ |  | 组合效果 |
| E4 | ✓ | ✓ | ✓ | 仅适用于有 step/state 的模型 |

至少报告 3 个种子或说明计算预算限制。保持训练预算、数据增强、scheduler 和评估协议一致。

### 6.4 指标

- 主任务准确率/FID/损失等现有指标；
- 模型大小、参数 bit 数、BOPs、额外 FLOPs；
- 峰值显存、训练 ms/iter、端到端推理延迟；
- scale map 和 `alpha` 的均值/方差/范围；
- teacher/student feature similarity；
- 失败样本或定性结果。

## 7. 代码质量要求

- 保持改动局部、配置默认关闭、baseline 无回归；
- 不复制粘贴多个近似量化层，抽象成可测试模块；
- 所有新配置进入现有配置系统，不硬编码路径、层名或超参数；
- feature hook 必须可释放，避免重复注册和内存泄漏；
- 对论文与本实现的差异写在注释和 README 中；
- 不提交 checkpoint、数据集、生成图片或大体积缓存；
- 运行仓库已有 lint/test，并在最终报告中列出命令和结果。

## 8. 最终交付格式

完成后请按以下结构回复：

1. **仓库审计**：关键文件与原始量化/训练流程；
2. **实现摘要**：修改文件、类/函数、配置项；
3. **论文对应关系**：BiDM 的哪个思想映射到本仓库哪里；
4. **偏离论文之处**：为何偏离、影响是什么；
5. **测试证据**：执行命令、通过/失败数、关键日志；
6. **实验结果**：E0–E4 表格；
7. **效率结果**：额外参数/FLOPs/显存/延迟；
8. **已知问题与下一步**；
9. **可直接审查的 diff 概览**。

若因缺失数据、checkpoint 或硬件无法完成完整实验，仍应完成实现与最小测试，并把阻塞项、复现命令和预期输出写清楚，不能用未经运行的结果冒充验证结果。

