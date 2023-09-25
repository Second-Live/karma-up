/* global io */
/* eslint-disable no-new */

const Karma = require('./karma')
const StatusUpdater = require('./updater')
const util = require('../common/util')
const constants = require('./constants')

const KARMA_URL_ROOT = constants.KARMA_URL_ROOT
const KARMA_PROXY_PATH = constants.KARMA_PROXY_PATH
const BROWSER_SOCKET_TIMEOUT = constants.BROWSER_SOCKET_TIMEOUT

// Connect to the server using socket.io https://socket.io/
const socket = io(location.host, {
  reconnectionDelay: 500,
  reconnectionDelayMax: Infinity,
  timeout: BROWSER_SOCKET_TIMEOUT,
  transports: ["websocket", "webtransport"],
  path: KARMA_PROXY_PATH + KARMA_URL_ROOT.slice(1) + 'socket.io',
  'sync disconnect on unload': true,
  useNativeTimers: true,
  closeOnBeforeunload: true
})

// instantiate the updater of the view
const updater = new StatusUpdater(socket, util.elm('title'), util.elm('banner'), util.elm('browsers'))
window.karma = new Karma(updater, socket, util.elm('context'), window.open,
  window.navigator, window.location, window.document)
