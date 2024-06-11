/* eslint-disable no-new */

const Karma = require('./karma')
const StatusUpdater = require('./updater')
const util = require('../common/util')
const constants = require('./constants')

const KARMA_URL_ROOT = constants.KARMA_URL_ROOT
const KARMA_PROXY_PATH = constants.KARMA_PROXY_PATH

const socket = new WebSocket('ws://' + location.host + KARMA_PROXY_PATH + KARMA_URL_ROOT.slice(1))
window.addEventListener('beforeunload', () => socket.close())
socket.emit = function (event, data) {
  this.send(JSON.stringify([event, data]))
}

// instantiate the updater of the view
const updater = new StatusUpdater(socket, util.elm('title'), util.elm('banner'), util.elm('browsers'))
window.karma = new Karma(updater, socket, util.elm('context'), window.open,
  window.navigator, window.location, window.document)
