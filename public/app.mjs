import { questions, version } from './questions.mjs'

import { score, validAnswers } from './report.mjs'

const main = document.querySelector('#main')
const draftKey = 'four-axis-draft'
const recordsKey = 'four-axis-reports'
const labels = ['非常同意', '比较同意', '不确定', '比较不同意', '非常不同意']
const tokenPattern = /^[a-f0-9]{64}$/
let draft = load(draftKey, null)

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false }
}

function readToken() {
  const token = location.hash.slice(1)
  return tokenPattern.test(token) ? token : ''
}

function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
}

function saveRecord(record) {
  const records = load(recordsKey, []).filter(item => item.token !== record.token)
  return save(recordsKey, [record, ...records])
}

function panel(html) {
  main.innerHTML = '<section class="panel">' + html + '<p class="message" id="message" role="status"></p></section>'
}

function message(value) {
  const box = document.querySelector('#message')
  if (box) box.textContent = value
}

function click(id, action) {
  document.getElementById(id).addEventListener('click', action)
}

function home() {
  panel('<p class="meta">48 道中文情境题</p><h1>16 型人格测评</h1>' +
    '<p>从互动方式、信息偏好、决策偏好和行动节奏，了解你的四字母人格倾向。</p>' +
    '<p class="muted">完成后立即免费查看完整报告。当前问卷处于试测阶段，结果供自我探索。</p>' +
    '<div class="actions"><button id="start">' + (draft?.version === version ? '继续答题' : '开始测评') + '</button></div>' +
    '<div id="history"></div>')
  click('start', () => {
    if (draft?.version !== version) draft = { token: newToken(), version, answers: [], index: 0 }
    showQuestion()
  })
  const records = load(recordsKey, []).filter(record => tokenPattern.test(record.token))
  if (records.length) {
    const history = document.querySelector('#history')
    history.innerHTML = '<h2>历史测评</h2>'
    for (const record of records) {
      const row = document.createElement('p')
      const link = document.createElement('a')
      link.href = '/#' + record.token
      link.textContent = new Date(record.date).toLocaleString('zh-CN') + ' · 查看报告'
      row.append(link)
      history.append(row)
    }
  }
}

function showQuestion() {
  const { index, answers } = draft
  const current = questions[index]
  panel('<p class="meta">第 ' + (index + 1) + ' 题 / ' + questions.length + ' 题</p>' +
    '<progress aria-label="作答进度" max="' + questions.length + '" value="' + answers.filter(Number.isInteger).length + '"></progress>' +
    '<fieldset><legend>' + current.text + '</legend>' +
    labels.map((label, i) => '<label class="option"><input type="radio" name="answer" value="' + i + '"' +
      (answers[index] === i ? ' checked' : '') + '>' + label + '</label>').join('') +
    '</fieldset><div class="actions"><button class="secondary" id="back">上一题</button>' +
    '<button id="next">' + (index === questions.length - 1 ? '提交测评' : '下一题') + '</button></div>')
  const next = document.querySelector('#next')
  next.disabled = !Number.isInteger(answers[index])
  document.querySelector('#back').disabled = index === 0
  document.querySelector('fieldset').addEventListener('change', event => {
    answers[index] = Number(event.target.value)
    next.disabled = false
    if (!save(draftKey, draft)) message('浏览器存储不可用，请在关闭页面前完成测评。')
  })
  click('back', () => { draft.index--; save(draftKey, draft); showQuestion() })
  click('next', () => {
    if (index < questions.length - 1) {
      draft.index++
      save(draftKey, draft)
      showQuestion()
      return
    }
    next.disabled = true
    document.querySelector('#back').disabled = true
    const { token } = draft
    try {
      if (!validAnswers(answers)) throw new Error('请完成所有题目后再提交。')
      if (!saveRecord({ token, answers, version, report: score(answers), date: new Date().toISOString() })) {
        throw new Error('浏览器无法保存这份测评。请检查存储空间或浏览器设置。')
      }
      draft = null
      save(draftKey, null)
      location.hash = token
    } catch (error) {
      next.disabled = false
      document.querySelector('#back').disabled = false
      message(error.message)
    }
  })
}

const localNotice = '<p class="muted">答题记录与测评报告保存在当前浏览器。清除网站数据或更换设备后，历史记录无法恢复。</p>'
const restartMarkup = '<div class="actions"><button class="secondary" id="restart">重新测试</button></div>'

function startOver() {
  draft = { token: newToken(), version, answers: [], index: 0 }
  save(draftKey, draft)
  history.replaceState(null, '', location.pathname)
  showQuestion()
}

function showReport(report) {
  panel('<p class="meta">完整报告 · 四维偏好</p><h1 class="type" id="type"></h1>' +
    '<p class="muted">X 表示该维度同分。分数显示你在量表上的位置。</p><div id="axes"></div>' + localNotice + restartMarkup)
  document.querySelector('#type').textContent = report.type
  const list = document.querySelector('#axes')
  report.dimensions.forEach(item => {
    const box = document.createElement('div')
    box.className = 'axis'
    box.innerHTML = '<h2></h2><div class="axis-head"><span></span><span></span></div><meter min="0" max="100"></meter><p></p><p class="muted"></p>'
    const [left, right] = box.querySelectorAll('span')
    const meter = box.querySelector('meter')
    left.textContent = item.poles[0] + ' ' + (100 - item.score) + '%'
    right.textContent = item.poles[1] + ' ' + item.score + '%'
    meter.value = item.score
    meter.setAttribute('aria-label', item.name)
    box.querySelector('h2').textContent = item.name + (item.ambiguous ? ' · 倾向不明显' : '')
    const [interpretation, practice] = box.querySelectorAll('p')
    interpretation.textContent = item.interpretation
    practice.textContent = item.practice || ''
    list.append(box)
  })
  if (report.nearby.length) {
    const note = document.createElement('p')
    note.textContent = '相邻类型供对照：' + report.nearby.join('、')
    list.append(note)
  }
  click('restart', startOver)
}

function route() {
  const token = readToken()
  if (!token) { home(); return }
  const record = load(recordsKey, []).find(item => item.token === token)
  if (!record) {
    panel('<h1>此浏览器没有这份测评</h1><p>历史测评保存在作答时使用的浏览器中。</p><a href="/">返回首页</a>')
    return
  }
  if (record.report) { showReport(record.report); return }
  if (record.version !== version || !validAnswers(record.answers)) {
    panel('<h1>这份测评暂无法生成报告</h1><p>这份记录的答案不完整，或来自其他题库版本。</p><a href="/">返回首页</a>')
    return
  }
  const report = score(record.answers)
  const saved = saveRecord({ ...record, report })
  showReport(report)
  if (!saved) message('浏览器无法写入历史记录，本次报告仍可查看。')
}

window.addEventListener('hashchange', route)
route()
