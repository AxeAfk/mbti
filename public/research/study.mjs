import { form, items, options, isStudyCode, makeExport } from './bank.mjs'

const root = document.querySelector('#study')
const key = 'four-axis/' + form
let state = read()

function read() {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}

function save() {
  try { localStorage.setItem(key, JSON.stringify(state)); return true } catch { return false }
}

function screen(html) {
  root.innerHTML = '<section class="panel">' + html + '<div id="status" role="status"></div></section>'
}

function status(text) {
  document.querySelector('#status').textContent = text
}

function on(id, event, listener) {
  document.querySelector('#' + id).addEventListener(event, listener)
}

function newCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), n => n.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function start(wave, code) {
  state = { wave, code, index: 0, answers: [] }
  const stored = save()
  question()
  if (!stored) status('当前浏览器无法保存进度。请在关闭页面前完成。')
}

function home() {
  screen('<h1>四维人格研究试测</h1><p>这是一份 80 题的中文试测，用来改进题目和计分。参与免费、自愿，完成后可选择导出作答。</p>' +
    '<p>请按你平时的做法选择。页面不收集姓名或联系方式，也不会自动上传作答。导出文件含随机研究码、题目答案、首测或复测标记及完成日期。请只在愿意参与分析时，把文件交给招募方。</p>' +
    '<p>首测后请保存研究码和作答文件，建议在 2–4 周后使用同一研究码复测。浏览器只保留最近一次作答。本次试测不提供人格判定。</p>' +
    '<label><input id="consent" type="checkbox"> 我年满 18 岁，已阅读说明并自愿作答</label>' +
    '<div class="actions"><button id="first" disabled>开始首测</button>' +
    (state && !state.completedOn ? '<button class="secondary" id="resume">继续上次作答</button>' : '') +
    (state?.completedOn ? '<button class="secondary" id="done">查看上次记录</button>' : '') +
    '</div><p><label for="code">复测研究码</label></p><input id="code" autocomplete="off" maxlength="24">' +
    '<div class="actions"><button class="secondary" id="repeat" disabled>开始复测</button></div>')
  on('consent', 'change', event => {
    document.querySelector('#first').disabled = document.querySelector('#repeat').disabled = !event.target.checked
  })
  if (state) document.querySelector('#code').value = state.code
  on('first', 'click', () => start(1, newCode()))
  on('repeat', 'click', () => {
    const code = document.querySelector('#code').value.trim().toUpperCase()
    if (!isStudyCode(code)) { status('请输入首测时获得的 24 位研究码。'); return }
    start(2, code)
  })
  if (state?.completedOn) on('done', 'click', completed)
  else if (state) on('resume', 'click', question)
}

function question() {
  const { index, answers } = state
  screen('<p class="meta">第 ' + (index + 1) + ' 题 / ' + items.length + ' 题</p>' +
    '<progress aria-label="答题进度" max="' + items.length + '" value="' + answers.filter(Number.isInteger).length + '"></progress>' +
    '<fieldset id="answers"><legend>' + items[index].text + '</legend>' +
    options.map((label, i) => '<label class="option"><input type="radio" name="answer" value="' + i + '"' +
      (answers[index] === i ? ' checked' : '') + '>' + label + '</label>').join('') +
    '</fieldset><div class="actions"><button class="secondary" id="back">上一题</button><button id="next">' +
    (index === items.length - 1 ? '完成试测' : '下一题') + '</button></div>')
  const next = document.querySelector('#next')
  next.disabled = !Number.isInteger(answers[index])
  document.querySelector('#back').disabled = index === 0
  on('answers', 'change', event => {
    answers[index] = Number(event.target.value)
    next.disabled = false
    if (!save()) status('当前浏览器无法保存进度。')
  })
  on('back', 'click', () => { state.index--; save(); question() })
  on('next', 'click', () => {
    if (!Number.isInteger(answers[index])) return
    if (index < items.length - 1) { state.index++; save(); question(); return }
    const today = new Date()
    state.completedOn = [today.getFullYear(), today.getMonth() + 1, today.getDate()].map(n => String(n).padStart(2, '0')).join('-')
    completed()
    if (!save()) status('进度未保存，请在关闭页面前导出。')
  })
}

function completed() {
  screen('<p class="meta">' + (state.wave === 1 ? '首测' : '复测') + '已完成</p><h1>保存研究码</h1>' +
    '<p><strong id="study-code"></strong></p><p>如果你愿意把本次作答用于研究，请导出文件并交给招募方。文件不会自动发送。</p>' +
    '<div class="actions"><button id="download">导出本次作答</button><button class="secondary" id="home">返回首页</button></div>')
  document.querySelector('#study-code').textContent = state.code
  on('home', 'click', home)
  on('download', 'click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(makeExport(state), null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'research-' + state.code + '-wave' + state.wave + '.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
}

home()
