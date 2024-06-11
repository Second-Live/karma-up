const VERSION = require('./constants').VERSION

function StatusUpdater (socket, titleElement, bannerElement, browsersElement) {
  function updateBrowsersInfo (browsers) {
    if (!browsersElement) {
      return
    }
    const elems = browsers.map(({ isConnected, name }) => {
      const status = isConnected ? 'idle' : 'executing'
      const li = document.createElement('li')
      li.className = status
      li.textContent = `${name} is ${status}`
      return li
    })
    browsersElement.replaceChildren(...elems)
  }

  let connectionText = 'never-connected'
  let testText = 'loading'

  function updateBanner () {
    if (!titleElement || !bannerElement) {
      return
    }
    titleElement.textContent = `Karma v ${VERSION} - ${connectionText}; test: ${testText};`
    bannerElement.className = connectionText === 'connected' ? 'online' : 'offline'
  }

  function updateConnectionStatus (connectionStatus) {
    connectionText = connectionStatus || connectionText
    updateBanner()
  }
  function updateTestStatus (testStatus) {
    testText = testStatus || testText
    updateBanner()
  }

  socket.addEventListener('open', () => updateConnectionStatus('connected'))
  socket.addEventListener('close', () => updateConnectionStatus('disconnected'))
  socket.addEventListener('message', (event) => {
    const [type, value] = JSON.parse(event.data)
    if (type === 'info') {
      updateBrowsersInfo(value)
    }
  })

  return { updateTestStatus }
}

module.exports = StatusUpdater
