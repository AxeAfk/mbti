import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const assets = {
  '/': ['index.html', 'text/html'],
  '/app.mjs': ['app.mjs', 'text/javascript'],
  '/checkout.mjs': ['checkout.mjs', 'text/javascript'],
  '/questions.mjs': ['questions.mjs', 'text/javascript'],
  '/style.css': ['style.css', 'text/css'],
}

const server = createServer(async (incoming, outgoing) => {
  const pathname = new URL(incoming.url, 'http://127.0.0.1').pathname
  if (!Object.hasOwn(assets, pathname)) { outgoing.writeHead(404).end(); return }
  const [name, type] = assets[pathname]
  try {
    const body = await readFile(new URL('./public/' + name, import.meta.url))
    outgoing.writeHead(200, { 'Content-Type': type + '; charset=utf-8' }).end(body)
  } catch {
    outgoing.writeHead(500).end()
  }
})

server.listen(Number(process.env.PERSONALITY_PORT || 4173), '127.0.0.1', () => {
  console.log('http://127.0.0.1:' + server.address().port)
})
