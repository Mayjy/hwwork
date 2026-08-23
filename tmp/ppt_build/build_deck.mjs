import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT = "F:/huawei job/output/presentation/离线调度模型BNN化技术探索_初稿.pptx";
const PREVIEW = "F:/huawei job/output/presentation";
const W = 1280, H = 720;
const C = { ink: "#101114", sub: "#5E636E", panel: "#EDEDED", rule: "#B8BCC4", blue: "#3D8DFF", light: "#D0EDFA", pale: "#F6F7F9", white: "#FFFFFF", red: "#D94A4A", green: "#27835D" };
const FONT = "Microsoft YaHei";

function box(slide, x, y, w, h, fill = C.panel, line = "none") {
  return slide.shapes.add({ geometry: "rect", position: { left:x, top:y, width:w, height:h }, fill, line: { style:"solid", fill:line, width: line === "none" ? 0 : 1 } });
}
function text(slide, value, x, y, w, h, size=22, color=C.ink, bold=false, align="left") {
  const s = slide.shapes.add({ geometry:"textbox", position:{left:x,top:y,width:w,height:h}, fill:"none", line:{style:"solid",fill:"none",width:0} });
  s.text = value;
  s.text.style = { fontSize:size, typeface:FONT, color, bold, alignment:align, verticalAlignment:"middle" };
  return s;
}
function title(slide, value, num) {
  text(slide, value, 52, 34, 1130, 88, 38, C.ink, true);
  text(slide, String(num).padStart(2,"0"), 1184, 654, 42, 24, 13, C.sub, false, "right");
}
function note(slide, talk, sources=[]) {
  slide.speakerNotes.textFrame.setText(`${talk}\n\n[Sources]\n${sources.length ? sources.join("\n") : "No external claims; presenter-authored framing."}`);
}
function bulletList(slide, items, x, y, w, lineH=52, size=21, color=C.ink) {
  items.forEach((it,i)=>{ text(slide, "•", x, y+i*lineH, 24, lineH, size, C.blue, true); text(slide, it, x+32, y+i*lineH, w-32, lineH, size, color); });
}
function arrow(slide, x, y, w) {
  box(slide,x,y+10,w,3,C.ink); box(slide,x+w-10,y+4,12,15,C.ink);
}

const deck = Presentation.create({ slideSize:{width:W,height:H} });

// 1 Cover
{
  const s=deck.slides.add(); s.background.fill=C.white;
  text(s,"技术探索 / BNN",52,40,300,30,16,C.sub,true);
  text(s,"离线调度模型的\n二值化训练探索",52,168,650,180,58,C.ink,true);
  text(s,"从表示补偿、监督结构到渐进训练路径",55,382,620,46,25,C.sub);
  box(s,790,54,430,570,C.light);
  text(s,"表示",838,150,140,56,34,C.ink,true); text(s,"×",1040,150,40,56,34,C.blue,true,"center"); text(s,"训练",1095,150,100,56,34,C.ink,true);
  box(s,836,260,320,6,C.blue); box(s,836,330,255,6,C.ink); box(s,836,400,185,6,C.rule);
  text(s,"公开论文启发\n+内部场景验证",838,468,300,92,27,C.ink,true);
  text(s,"汇报人：[公司内填写]    日期：[填写]",55,628,620,30,16,C.sub);
  note(s,"开场不要先讲论文。先说明本次工作的目标：识别离线调度模型 BNN 化的主要瓶颈，并验证公开方法的适用边界。",[]);
}

// 2 Problem
{
  const s=deck.slides.add(); title(s,"二值化的收益明确，真正困难的是精度如何保住",2);
  text(s,"部署侧",58,168,240,36,25,C.sub,true); text(s,"训练侧",720,168,240,36,25,C.sub,true);
  text(s,"-1 / +1",58,225,420,110,68,C.blue,true);
  bulletList(s,["显著压缩权重与激活存储","位运算替代部分乘加","适合资源受限的离线部署"],58,360,500,54,21);
  box(s,640,150,2,450,C.rule);
  text(s,"符号保留了，幅值消失了",720,225,465,54,30,C.ink,true);
  bulletList(s,["离散前向与连续反向不一致","深层网络的误差与梯度问题累积","W1A1 与 W4A4 的难度不是线性关系"],720,320,470,58,21);
  note(s,"这里在公司内补充模型为何需要 BNN 化，但不要展示敏感架构。强调 W1A1 是质变，而不是 W4A4 再少三位。",["BiDM, arXiv:2412.05926, Sec. 1 and 3.1","StoMPP, arXiv:2606.27759, Sec. 1 and 2"]);
}

// 3 Framework
{
  const s=deck.slides.add(); title(s,"把精度损失拆成三类问题，才能判断方法为何有效",3);
  const xs=[52,450,848], names=["表示幅值","监督结构","训练路径"], desc=["Sign 只保留符号\n固定尺度难匹配动态范围","二值学生容量有限\n逐点模仿教师可能过难","全网过早进入硬二值\n深层梯度路径可能受阻"], tags=["Learnable Scale / TBS","SPD / Relation Distill","StoMPP"];
  xs.forEach((x,i)=>{ text(s,`0${i+1}`,x,182,70,42,22,C.blue,true); text(s,names[i],x,230,300,52,31,C.ink,true); box(s,x,302,330,2,C.rule); text(s,desc[i],x,332,330,112,21,C.sub); box(s,x,494,330,72,i===0?C.light:C.panel); text(s,tags[i],x+18,508,294,42,19,C.ink,true); });
  note(s,"这一页是全场的导航。后续不是按论文顺序介绍，而是回答三个问题：表示、监督、训练路径。",["Presenter synthesis based on BiDM and StoMPP."]);
}

// 4 Scale
{
  const s=deck.slides.add(); title(s,"可学习尺度用少量连续信息，补回 Sign 丢失的幅值",4);
  text(s,"朴素二值",54,162,270,38,24,C.sub,true); text(s,"aᵦ = sign(a)",54,220,420,72,39,C.ink,true);
  text(s,"0.01 与 20 最终都变成 +1",54,305,450,38,21,C.red);
  arrow(s,530,250,115);
  text(s,"尺度补偿",700,162,270,38,24,C.sub,true); text(s,"aᵦ = K · sign(a)",700,220,500,72,39,C.blue,true);
  text(s,"K 恢复这一层、通道或位置的大致强度",700,305,500,48,21,C.sub);
  box(s,54,424,1128,132,C.pale,C.rule);
  text(s,"迁移判断",80,446,150,34,22,C.ink,true);
  text(s,"如果调度模型不同层、样本、节点或决策阶段的激活范围差异明显，固定尺度就可能成为瓶颈。",80,488,1040,48,22,C.ink);
  note(s,"重点区分权重 scale、激活 scale、固定参数和输入相关动态 scale。BiDM 中不仅有权重 sigma，还把激活动态尺度里的 tiny convolution k 改成可学习。",["BiDM, arXiv:2412.05926, Eq. 6-10 and Appendix Table 5"]);
}

// 5 SPD
{
  const s=deck.slides.add(); title(s,"SPD 不要求逐点抄写教师，而是匹配局部关系",5);
  text(s,"传统特征蒸馏",56,164,360,38,24,C.sub,true);
  box(s,56,225,430,210,C.panel); text(s,"Teacher feature",86,250,180,30,18,C.sub,true); text(s,"逐点 L2",187,328,170,44,31,C.red,true,"center");
  text(s,"误差大的位置主导；W1A1 学生很难精细复现",56,462,430,74,20,C.sub);
  arrow(s,520,315,100);
  text(s,"Space Patched Distillation",680,164,500,38,24,C.sub,true);
  const px=[680,810,940,1070]; px.forEach((x,i)=>{box(s,x,225,104,104,i===1?C.light:C.panel,C.rule); text(s,`Patch ${i+1}`,x,258,104,30,16,C.ink,true,"center");});
  text(s,"每个 patch 内：A = P · Pᵀ",680,366,500,42,27,C.blue,true);
  text(s,"匹配局部关系，而非绝对数值",680,432,500,46,22,C.ink);
  text(s,"关键边界：调度张量的“相邻位置”是否真的语义相邻？",680,494,500,58,21,C.red,true);
  note(s,"解释 SPD 的三步：切 patch、构造关系矩阵、归一化后比较。随后立即指出迁移边界：二维 patch 是图像特有假设。",["BiDM, arXiv:2412.05926, Sec. 3.3, Eq. 13-16"]);
}

// 6 Transfer table
{
  const s=deck.slides.add(); title(s,"从扩散模型迁移时，三种机制的成立条件并不相同",6);
  const vals=[
    ["机制","原论文成立条件","调度 BNN 需要验证","迁移判断"],
    ["Learnable scale","激活范围动态变化","层/节点/阶段的幅值差异","较强"],
    ["跨 timestep 连接","相邻去噪步特征相似","是否存在对应的相邻决策状态","条件性"],
    ["SPD","二维空间局部性","是否存在有语义的邻域分组","较弱 / 需改造"]
  ];
  const t=s.tables.add({rows:4,columns:4,left:54,top:168,width:1172,height:330,values:vals,columnWidths:[210,325,425,212]});
  t.borders.assign({style:"solid",fill:C.rule,width:1});
  for(let c=0;c<4;c++){t.getCell(0,c).fill=C.ink;t.getCell(0,c).text.style={fontSize:18,bold:true,color:C.white,typeface:FONT};}
  for(let r=1;r<4;r++) for(let c=0;c<4;c++){t.getCell(r,c).text.style={fontSize:17,color:C.ink,typeface:FONT}; if(r%2===0)t.getCell(r,c).fill=C.pale;}
  text(s,"迁移不是复制结构，而是验证原方法依赖的观察是否仍然成立。",54,545,1120,54,25,C.blue,true);
  note(s,"这是主动展示边界，而不是自我否定。领导和专家会更关心你是否知道为什么迁移。",["Presenter synthesis based on BiDM, Sec. 3.2-3.3."]);
}

// 7 StoMPP
{
  const s=deck.slides.add(); title(s,"StoMPP 改变的不是网络结构，而是进入硬二值的路径",7);
  text(s,"u′ = M · sign(u) + (1−M) · Smooth(u)",54,157,1120,66,35,C.blue,true,"center");
  text(s,"M = 0：连续代理",90,267,340,42,23,C.ink,true); text(s,"M = 1：硬二值",850,267,340,42,23,C.ink,true,"right");
  const ys=360; for(let i=0;i<10;i++){box(s,90+i*105,ys,72,72,i<3?C.ink:(i<6?C.light:C.panel),C.rule); text(s,i<3?"1":(i<6?"~":"0"),90+i*105,ys+17,72,36,20,i<3?C.white:C.ink,true,"center");}
  arrow(s,92,470,1010);
  text(s,"训练推进：当前层中被冻结的条目比例从 0 增至 1",92,505,1010,42,21,C.sub,false,"center");
  text(s,"注意：这不是停止更新整层参数，而是逐条目切换 continuous / sign。",92,574,1010,42,22,C.red,true,"center");
  note(s,"先纠正常见误解：所谓 freezing 是提交为硬二值状态。讲清 mask 与张量同形状，当前层内可部分二值。",["StoMPP, arXiv:2606.27759, Sec. 3.1-3.2, Eq. 1-2"]);
}

// 8 Gradient path
{
  const s=deck.slides.add(); title(s,"输入到输出的顺序，为当前过渡层保留可导后缀",8);
  text(s,"Forward layerwise",54,160,420,38,24,C.green,true);
  const x0=60,y0=245; for(let i=0;i<7;i++){box(s,x0+i*155,y0,112,78,i<2?C.ink:(i===2?C.light:C.panel),C.rule); text(s,i<2?"已二值":(i===2?"过渡层":"连续"),x0+i*155,y0+20,112,36,18,i<2?C.white:C.ink,true,"center"); if(i<6)arrow(s,x0+112+i*155,y0+28,40);}
  text(s,"Loss 梯度可穿过连续后缀，到达当前过渡层",60,350,1080,42,22,C.green,true,"center");
  text(s,"Reverse layerwise",54,438,420,38,24,C.red,true);
  for(let i=0;i<7;i++){box(s,x0+i*155,500,112,78,i>4?C.ink:(i===4?C.light:C.panel),C.rule); text(s,i>4?"已二值":(i===4?"过渡层":"待训练"),x0+i*155,520,112,36,18,i>4?C.white:C.ink,true,"center");}
  text(s,"后段硬 Sign 可能先切断前面层的梯度",60,600,1080,42,21,C.red,true,"center");
  note(s,"这页只讲 STE-free 的机制最清晰。补充说明 StoMPP+STE 会给冻结条目代理梯度，因此梯度不是严格为零，但训练顺序仍可能影响优化。",["StoMPP, arXiv:2606.27759, Sec. 3.3 and Fig. 1"]);
}

// 9 Applicability
{
  const s=deck.slides.add(); title(s,"StoMPP 最可能在深层 W1A1 从头训练中体现价值",9);
  text(s,"更可能有效",54,158,400,40,26,C.green,true);
  bulletList(s,["权重和激活都接近 W1A1","网络深，存在随深度退化","从头训练或需要大幅适应","硬 Sign 后梯度明显衰减"],54,218,490,62,21);
  box(s,632,148,2,448,C.rule);
  text(s,"收益可能较小",710,158,400,40,26,C.red,true);
  bulletList(s,["W4A4 等多比特量化","只量化权重，激活连续","预训练微调、网络较浅","STE 或残差路径已提供梯度"],710,218,490,62,21);
  box(s,54,520,1128,78,C.light); text(s,"没有提升 ≠ 方法错误；可能是当前模型并不存在论文所针对的主要矛盾。",80,537,1076,44,23,C.ink,true,"center");
  note(s,"把当前结果一般的风险提前转化为适用条件分析。论文自己的预训练 BiReal-18 实验中 StoMPP 也低于 STE，说明初始化与训练规则存在交互。",["StoMPP, arXiv:2606.27759, Sec. 4.3, Table 4, Sec. 6"]);
}

// 10 Experiment placeholder
{
  const s=deck.slides.add(); title(s,"内部实验只需回答：哪个瓶颈得到了证据支持？",10);
  const vals=[
    ["方法","位宽","主指标","相对基线","训练现象","判断"],
    ["Baseline","W[ ]A[ ]","[公司内填写]","-","[填写]","对照"],
    ["+ Learnable Scale","W[ ]A[ ]","[填写]","[填写]","[填写]","幅值假设"],
    ["+ Distillation","W[ ]A[ ]","[填写]","[填写]","[填写]","监督假设"],
    ["+ Progressive","W[ ]A[ ]","[填写]","[填写]","[填写]","路径假设"]
  ];
  const t=s.tables.add({rows:5,columns:6,left:52,top:155,width:1176,height:350,values:vals,columnWidths:[230,125,210,180,230,201]});
  t.borders.assign({style:"solid",fill:C.rule,width:1});
  for(let c=0;c<6;c++){t.getCell(0,c).fill=C.ink;t.getCell(0,c).text.style={fontSize:17,bold:true,color:C.white,typeface:FONT};}
  for(let r=1;r<5;r++)for(let c=0;c<6;c++){t.getCell(r,c).text.style={fontSize:16,color:C.ink,typeface:FONT};if(r%2===0)t.getCell(r,c).fill=C.pale;}
  text(s,"公司内替换占位符；不要把内部结果提交到公开仓库。",52,550,1176,42,23,C.red,true,"center");
  note(s,"在公司内填写。结果展示优先保持同一训练预算、相同随机种子策略和相同评估协议。",[]);
}

// 11 Interpretation
{
  const s=deck.slides.add(); title(s,"当前现象可以形成判断，但机制结论仍需诊断证据",11);
  const xs=[52,450,848], heads=["Scale 有正收益","SPD 收益有限","Layerwise 收益有限"], copy=["与幅值失配假设一致\n建议补：尺度分布与特征误差","先检查局部性是否成立\n再检查教师对齐与梯度冲突","先核对位宽、深度和训练起点\n再做 forward / global / reverse"], colors=[C.light,C.panel,C.panel];
  xs.forEach((x,i)=>{box(s,x,178,330,330,colors[i],C.rule);text(s,heads[i],x+24,210,282,54,26,C.ink,true);box(s,x+24,286,282,2,C.rule);text(s,copy[i],x+24,320,282,120,20,C.sub);});
  text(s,"措辞原则：论文范围内说“论文表明”；内部现象说“与假设一致”；原因未验证时说“推测”。",52,554,1128,60,22,C.blue,true,"center");
  note(s,"这一页在公司内按真实结果微调。不要把单次 2%-3% 改善直接说成机制已被证明。",["Presenter interpretation framework; no internal results included."]);
}

// 12 Close
{
  const s=deck.slides.add(); title(s,"下一步不做大范围调参，先用最小实验定位主要瓶颈",12);
  const xs=[54,446,838], labels=["01 / 表示","02 / 监督","03 / 路径"], heads=["尺度粒度消融","语义分组蒸馏","顺序与梯度诊断"], copy=["固定 vs. 可学习\nper-tensor vs. per-channel\n记录特征误差","输出蒸馏 vs. L2\n关系蒸馏需按任务语义分组","forward / global / reverse\n记录逐层 gradient norm"];
  xs.forEach((x,i)=>{text(s,labels[i],x,176,330,34,18,C.blue,true);text(s,heads[i],x,232,330,46,28,C.ink,true);box(s,x,296,330,2,C.rule);text(s,copy[i],x,330,330,150,21,C.sub);});
  box(s,54,548,1114,2,C.ink);
  text(s,"目标：把“方法有没有提升”转化为“调度 BNN 的主要误差来自哪里”。",54,576,1114,52,25,C.ink,true,"center");
  note(s,"结束时回到开场：本次工作的价值是缩小问题空间，而不是保证每篇论文的模块都有效。",["Presenter synthesis based on the proposed diagnostic plan."]);
}

await fs.mkdir(PREVIEW,{recursive:true});
for (const [i,s] of deck.slides.items.entries()) {
  const blob=await deck.export({slide:s,format:"png",scale:1});
  await fs.writeFile(`${PREVIEW}/slide-${String(i+1).padStart(2,"0")}.png`,new Uint8Array(await blob.arrayBuffer()));
  const layout=await s.export({format:"layout"});
  await fs.writeFile(`${PREVIEW}/slide-${String(i+1).padStart(2,"0")}.layout.json`,await layout.text());
}
const montage=await deck.export({format:"webp",montage:true,scale:1});
await fs.writeFile(`${PREVIEW}/montage.webp`,new Uint8Array(await montage.arrayBuffer()));
const pptx=await PresentationFile.exportPptx(deck);
await pptx.save(OUT);
console.log(OUT);
