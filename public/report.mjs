import { axes, questions, version } from './questions.mjs'

const practices = [
  ['重要讨论前给别人留一点准备时间，也可以约一次短谈把想法说出来。', '提前看议程或写下要点，给自己留一段安静时间整理想法。'],
  ['介绍方案时先给具体例子，再说明这些例子共同指向什么。', '分享新想法时补一个真实用例，让别人能看见第一步怎么做。'],
  ['解释判断依据后，可以问对方这个决定会给他们带来什么具体影响。', '说明对人的影响时，也可以把判断标准写明，方便大家理解取舍。'],
  ['提前定下几个关键节点，同时留出一段时间应对临时变化。', '保留执行空间，同时约定一个必须做决定的时间点。'],
]

export function validAnswers(answers) {
  return Array.isArray(answers) && answers.length === questions.length &&
    answers.every(answer => Number.isInteger(answer) && answer >= 0 && answer <= 4)
}

export function score(answers) {
  const totals = axes.map(() => 0)
  const counts = axes.map(() => 0)
  questions.forEach(({ axis, towardSecond }, index) => {
    totals[axis] += (answers[index] - 2) * (towardSecond ? -1 : 1)
    counts[axis]++
  })
  const dimensions = axes.map(({ code, name, poles, detail }, index) => {
    const total = totals[index]
    const score = Math.round(50 + 50 * total / (2 * counts[index]))
    const ambiguous = Math.abs(score - 50) <= 8
    const pole = Number(total > 0)
    return {
      code, name, poles, score, ambiguous,
      letter: total === 0 ? 'X' : code[pole],
      interpretation: ambiguous
        ? '两侧得分接近。可以回想自己是否会随任务、熟悉程度或当时的状态切换做法。'
        : detail[pole],
      practice: ambiguous
        ? '选一个最近发生的情境，回想你当时采用了哪种做法，换一个情境时会不会变化。'
        : practices[index][pole],
    }
  })

  return {
    version,
    type: dimensions.map(item => item.letter).join(''),
    dimensions,
    nearby: dimensions.flatMap((item, index) => {
      if (!item.ambiguous) return []
      return item.code.replace(item.letter, '').split('').map(letter =>
        dimensions.map((axis, position) => index === position ? letter : axis.letter).join('')
      )
    }),
  }
}
