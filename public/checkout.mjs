async function request(action, payload) {
  const response = await fetch('/api/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) throw new Error(result?.error || '支付服务暂时不可用。')
  return result
}

export function showCheckout(record, { panel, message, saveRecord, latest, startOver, showReport }) {
  panel('<p class="meta">测评已完成</p><h1>解锁完整报告</h1><p>四字母类型、四维得分和中文解读。</p>' +
    '<h2>¥20 · 微信扫码</h2><p class="muted">请用另一台设备的微信扫一扫。付款后本页会自动查询，也可手动查询。</p>' +
    '<div id="code" aria-busy="true"></div><div class="actions"><button id="pay" hidden>重新获取二维码</button>' +
    '<button class="secondary" id="check" disabled>查询付款状态</button>' +
    '<button class="secondary" id="restart">重新测试</button></div>' +
    '<p class="muted">换设备或清除浏览器数据前，请先查看报告。可从当前浏览器的历史测评找回。</p>')

  let active = true
  let busy = false
  let polling = false
  let pollStarted = 0
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

  function schedule(immediate = false) {
    clearTimeout(timer)
    if (!active || !polling || document.hidden || !record.started) return
    const elapsed = Date.now() - pollStarted
    const delay = immediate ? 0 : elapsed < 60000 ? 2000 : elapsed < 300000 ? 5000 : 10000
    timer = setTimeout(async () => {
      if (document.hidden) return
      await run(async () => {
        const isExpired = record.qr && record.expires <= Date.now()
        if (isExpired) paintQr()
        if ((await refresh('status')).state !== 'paid' && active && isExpired) {
          polling = false
          pay.hidden = false
          message('二维码已过期。若已付款，请查询付款状态。')
        }
      }, true)
      schedule()
    }, delay)
  }

  async function prepare() {
    if (!active) return
    Object.assign(record, latest())
    if (record.report) { showReport(record.report); return }
    if (record.qr && record.expires > Date.now()) {
      paintQr()
      message('请扫码付款，到账后会自动打开报告。')
      return
    }
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
      paintQr()
      message('请扫码付款，到账后会自动打开报告。')
    }
  }

  async function getQr() {
    pay.hidden = true
    check.disabled = true
    code.setAttribute('aria-busy', 'true')
    message('正在获取微信付款二维码…')
    try {
      if (navigator.locks) await navigator.locks.request('checkout-' + record.token, prepare)
      else await prepare()
    } catch (error) {
      if (active) pay.hidden = false
      throw error
    } finally {
      if (active) {
        code.setAttribute('aria-busy', 'false')
        check.disabled = !record.started
        polling = Boolean(record.started)
        pollStarted = Date.now()
        schedule(true)
      }
    }
  }

  function onVisibility() { schedule(true) }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', onVisibility)
  pay.onclick = () => run(getQr)
  check.onclick = () => run(async () => {
    if (!record.started) return
    if ((await refresh('status')).state !== 'paid' && active) {
      message('暂未查到付款成功，请稍后再试。')
    }
  })

  run(async () => {
    const { enabled } = await request('availability')
    if (!active) return
    if (!enabled) {
      code.setAttribute('aria-busy', 'false')
      message('微信支付尚未配置。测评已保存在历史记录。')
      return
    }
    await getQr()
  })
  return () => {
    active = false
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', onVisibility)
  }
}
