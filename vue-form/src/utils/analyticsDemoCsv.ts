export interface AnalyticsDemoPreset {
    key: string
    fileName: string
    csv: string
}

export interface AnalyticsDemoOption {
    key: string
    label: string
    fileName: string
}

const presetList: AnalyticsDemoPreset[] = [
    {
        key: 'cartesian',
        fileName: 'bar-line-basic.csv',
        csv: `Month,Revenue,Cost,Profit
2026-01,820,540,280
2026-02,932,610,322
2026-03,901,590,311
2026-04,934,620,314
2026-05,1290,880,410
2026-06,1330,900,430
`,
    },
    {
        key: 'pie',
        fileName: 'pie-simple.csv',
        csv: `Category,Value
Search Engine,1048
Direct,735
Email,580
Affiliate Ads,484
Video Ads,300
`,
    },
    {
        key: 'funnel',
        fileName: 'funnel-basic.csv',
        csv: `Category,Value
Visit,100
Inquiry,80
Order,60
Click,40
Show,20
`,
    },
    {
        key: 'gauge',
        fileName: 'gauge-basic.csv',
        csv: `Category,Value
Service SLA,72
Quality Score,86
Customer Health,91
`,
    },
    {
        key: 'scatter',
        fileName: 'scatter-simple.csv',
        csv: `X,Y,ScatterSize
10.0,8.04,12
8.0,6.95,15
13.0,7.58,19
9.0,8.81,13
11.0,8.33,17
14.0,9.96,22
`,
    },
    {
        key: 'radar',
        fileName: 'radar-basic.csv',
        csv: `Category,Revenue,Cost,Profit
Sales,4300,3200,3500
Administration,10000,9000,9800
Information Tech,28000,26000,30000
Customer Support,35000,33000,34000
Development,50000,46000,48000
Marketing,19000,17000,18500
`,
    },
    {
        key: 'sankey',
        fileName: 'sankey-simple.csv',
        csv: `Source,Target,LinkValue
Visit,Inquiry,120
Inquiry,Proposal,80
Proposal,Order,55
Order,Renewal,30
Visit,DropOff,40
Proposal,Lost,25
`,
    },
    {
        key: 'graph',
        fileName: 'graph-simple.csv',
        csv: `Source,Target,LinkValue
Vue,Router,6
Vue,Pinia,5
Vite,Vue,7
TypeScript,Vue,4
Pinia,ECharts,3
Router,ECharts,2
`,
    },
    {
        key: 'chord',
        fileName: 'chord-simple.csv',
        csv: `Source,Target,LinkValue
Europe,Asia,120
Asia,Europe,95
Europe,America,80
America,Europe,70
Asia,America,60
America,Asia,65
Asia,Africa,35
Africa,Asia,28
`,
    },
    {
        key: 'hierarchy',
        fileName: 'tree-basic.csv',
        csv: `NodeID,ParentID,Name,NodeValue
company,,Company,0
sales,company,Sales,40
marketing,company,Marketing,32
engineering,company,Engineering,55
platform,engineering,Platform,21
frontend,engineering,Frontend,18
backend,engineering,Backend,16
`,
    },
    {
        key: 'mixed',
        fileName: 'viz-demo.csv',
        csv: `Category,Month,Revenue,Cost,Profit,Share,Source,Target,LinkValue,NodeID,ParentID,NodeValue,ScatterX,ScatterY,ScatterSize
Cloud,2026-01,120,72,48,28,,,,Cloud,,12,12.5,28.4,18
Cloud,2026-02,132,79,53,29,,,,Cloud,,13,13.6,29.3,20
Cloud,2026-03,145,84,61,31,,,,Cloud,,14,14.2,30.8,22
Security,2026-01,98,58,40,23,Cloud,Security,14,Security,Cloud,9,9.2,21.4,16
Security,2026-02,103,61,42,22,Cloud,Security,16,Security,Cloud,10,10.1,22.0,17
Security,2026-03,111,66,45,24,Cloud,Security,18,Security,Cloud,11,10.8,23.7,19
AI,2026-01,86,51,35,20,Security,AI,11,AI,Security,8,7.9,18.1,14
AI,2026-02,93,56,37,21,Security,AI,13,AI,Security,9,8.4,19.2,15
AI,2026-03,101,59,42,22,Security,AI,15,AI,Security,10,9.0,20.1,16
`,
    },
]

export const analyticsDemoPresets = Object.fromEntries(
    presetList.map(preset => [preset.key, preset]),
) as Record<string, AnalyticsDemoPreset>

const presetLabels: Record<string, string> = {
    cartesian: '柱状/折线/面积',
    pie: '饼图/环图',
    funnel: '漏斗图',
    gauge: '仪表盘',
    scatter: '散点图',
    radar: '雷达图',
    sankey: '桑基图',
    graph: '关系图',
    chord: '和弦图',
    hierarchy: '树图/矩形树图',
    mixed: '综合示例',
}

export const analyticsDemoOptions: AnalyticsDemoOption[] = presetList.map(preset => ({
    key: preset.key,
    label: presetLabels[preset.key] || preset.key,
    fileName: preset.fileName,
}))

const presetKeysByKind: Record<string, string> = {
    bar: 'cartesian',
    line: 'cartesian',
    area: 'cartesian',
    stack_bar: 'cartesian',
    stack_area: 'cartesian',
    pie: 'pie',
    donut: 'pie',
    funnel: 'funnel',
    gauge: 'gauge',
    scatter: 'scatter',
    radar: 'radar',
    sankey: 'sankey',
    graph: 'graph',
    chord: 'chord',
    tree: 'hierarchy',
    treemap: 'hierarchy',
}

export function getAnalyticsDemoPreset(kind?: string): AnalyticsDemoPreset {
    const key = (kind && presetKeysByKind[kind]) || 'mixed'
    const preset = analyticsDemoPresets[key]
    return preset || analyticsDemoPresets.mixed!
}

export function isAnalyticsDemoFileName(name?: string): boolean {
    if (!name) return false
    return presetList.some(preset => preset.fileName === name)
}
