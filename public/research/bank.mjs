import { questions } from '../questions.mjs'

export const form = 'zh-four-axes-research-1'
export const options = ['非常不同意', '比较不同意', '不确定', '比较同意', '非常同意']

// Keep the wording and order of the baseline stable across both waves.
const candidate = [
  ['周末做一件轻松的事时，有人一起通常更让我享受这个过程。','即使没有人打扰，我也喜欢把一天中的一段时间专门留给自己。','遇到一个还不熟悉的话题时，我喜欢通过交谈弄清楚自己怎么看。','讨论结束后，我喜欢一个人回顾刚才想到的内容。','在熟悉的小组里，我愿意通过来回交流逐步补充想法。','几个活动都喜欢时，我有时会特意选能自己安静参与的那一个。','有一段空闲时间时，和熟人相处通常会让我更有精神。','看完一部印象很深的电影，我常想先自己回味一会儿。'],
  ['第一次用一个新工具时，我常从照着示例做一遍开始。','听完一个具体案例，我常想它有没有揭示更普遍的规律。','朋友讲一件新鲜事时，我常先问当时发生了什么。','整理读书笔记时，我常按不同章节共通的主题来归类。','看到不熟悉的东西，我常先留意形状、用途或能直接观察到的特征。','接触一种新做法时，我常想它能迁移到哪些别的场景。','两份说明都清楚时，我通常先看有实际操作步骤的那份。','别人讲起几件日常小事时，我常先想这些事可能有什么联系。'],
  ['朋友向我征求意见时，我通常先弄清有哪些标准可以用来比较选项。','两种做法的成本相近时，我通常优先考虑哪一种更符合当事人在意的事。','分配一项共同资源时，我倾向于采用事先定好并适用于类似情况的标准。','讨论该不该为某个情况破例时，我常先了解这个决定对当事人有什么意义。','两项建议都符合我看重的价值时，我通常比较它们各自的论证是否一致。','两项建议都有道理时，我常先想哪一项更照顾到相关人员的实际处境。','解释一个取舍时，我通常先把支持这项决定的证据和标准讲清楚。','讨论一项共同决定时，我常先问大家各自最不愿放弃的是什么。'],
  ['买一件不急用的东西前，我也习惯先定好何时去选。','开始一天的家务时，我愿意根据做着做着发现的情况改变顺序。','准备学一个兴趣项目时，我喜欢先定下第一次开始的时间。','即使有时间提前约好活动，我也享受当天再决定做什么。','和朋友一起做一件没有截止日期的事，我也倾向于先分好步骤。','做饭时已有几种合适做法，我喜欢看当时有什么食材再选。','手头有几件都不着急的事时，先定做事顺序会让我更踏实。','两种安排都说得通时，我往往会把决定留到更接近当天。'],
]

const axisCodes = ['EI', 'SN', 'TF', 'JP']
export const items = [
  ...questions.map((item, i) => ({ ...item, id: axisCodes[item.axis] + '-' + String(Math.floor(i / 4) + 1).padStart(2, '0') })),
  ...candidate[0].flatMap((_, row) => candidate.map((set, axis) => ({
    id: axisCodes[axis] + '-' + String(row + 13), axis, towardSecond: row % 2 === 1, text: set[row],
  }))),
]

export function isStudyCode(value) {
  return typeof value === 'string' && /^[A-F0-9]{24}$/.test(value)
}

export function makeExport({ code, wave, answers, completedOn }) {
  if (!isStudyCode(code) || ![1, 2].includes(wave) || !Array.isArray(answers) || answers.length !== items.length ||
      !items.every((_, index) => Number.isInteger(answers[index]) && answers[index] >= 0 && answers[index] <= 4)) {
    throw new Error('研究码或作答不完整')
  }
  return { form, studyCode: code, wave, completedOn, answers: Object.fromEntries(items.map((item, i) => [item.id, answers[i]])) }
}
