async function request(action, payload) {
  const response = await fetch('/api/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) throw new Error(result?.error || '支付服务暂时不可用。')
  return result
}

export function showCheckout(record, { panel, message, saveRecord, latest, startOver, showReport }) {
  panel('<p class="meta">测评已完成</p><h1>解锁完整报告</h1><p>四字母类型、四维得分和中文解读。</p>' +
    '<h2>¥20 · 微信扫码</h2><p class="muted">请用另一台设备的微信扫一扫。付款后本页会自动查询，也可手动查询。</p>' +
    '<div class="actions"><button id="pay" disabled>生成付款二维码</button>' +
    '<button class="secondary" id="check" disabled>查询付款状态</button>' +
    '<button class="secondary" id="restart">重新测试</button></div><div id="code"></div>' +
    '<p class="muted">换设备或清除浏览器数据前，请先查看报告。可从当前浏览器的历史测评找回。</p>')

  let active = true
  let busy = false
  let ticks = 0
  let timer
  const pay = document.querySelector('#pay')
  const check = document.querySelector('#check')
  const code = document.querySelector('#code')
  document.querySelector('#restart').onclick = startOver

  function paintQr() {
    code.replaceChildren()
    if (!record.qr || record.expires <= Date.now()) return
    const image = new Image(220, 220)
    image.alt = '微信支付 20 元二维码'
    image.src = record.qr
    code.append(image)
  }

  const order = () => ({ token: record.token, digest: record.digest, started: record.started })

  async function refresh(action) {
    let result = await request(action, order())
    if (result.state === 'confirmed') {
      result = await request('status', { ...order(), version: record.version, answers: record.answers })
    }
    if (result.state === 'paid') {
      record.report = result.report
      delete record.qr
      const stored = saveRecord(record)
      if (active) {
        showReport(record.report)
        if (!stored) message('当前浏览器未能保存报告，可从历史记录重新查询。')
      }
    }
    return result
  }

  async function run(task, quiet = false) {
    if (!active || busy) return
    busy = true
    try {
      await task()
    } catch (error) {
      if (active && !quiet) message(error.message)
    } finally {
      busy = false
    }
  }

  async function prepare() {
    if (!active) return
    Object.assign(record, latest())
    if (record.report) { showReport(record.report); return }
    if (record.qr && record.expires > Date.now()) { paintQr(); return }
    if (record.started) {
      const previous = await refresh('close')
      if (!active || previous.state === 'paid') return
      if (previous.renewable) delete record.started
      else if (record.qr) throw new Error('订单正在确认，请稍后查询。')
    }
    if (!record.digest) {
      const bytes = await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(JSON.stringify([record.version, record.answers])))
      record.digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
    }
    record.started ||= Date.now()
    if (!saveRecord(record)) throw new Error('无法保存订单。请检查浏览器存储后重试。')
    const result = await request('checkout', order())
    Object.assign(record, { qr: result.qr, expires: result.expires })
    saveRecord(record)
    if (active) {
      ticks = 0
      paintQr()
      message('等待付款确认。')
    }
  }

  pay.onclick = () => run(() => navigator.locks
    ? navigator.locks.request('checkout-' + record.token, prepare)
    : prepare())
  check.onclick = () => run(async () => {
    if (!record.started) { message('请先生成付款二维码。'); return }
    if ((await refresh('status')).state !== 'paid' && active) {
      message('暂未查到付款成功，请稍后再试。')
    }
  })

  run(async () => {
    const { enabled } = await request('availability')
    if (!active) return
    if (!enabled) { message('微信支付尚未配置。测评已保存在历史记录。'); return }
    pay.disabled = check.disabled = false
    paintQr()
    timer = setInterval(() => {
      if (document.hidden || !record.started || ticks++ >= 24) return
      if (record.qr && record.expires <= Date.now()) paintQr()
      run(() => refresh('status'), true)
    }, 10000)
    if (record.started) await refresh('status')
  })
  return () => { active = false; clearInterval(timer) }
}
