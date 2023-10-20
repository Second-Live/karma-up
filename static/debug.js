// Override the Karma setup for local debugging
window.__karma__.info = function (info) {
  if (info.dump && window.console) window.console.log(info.dump)
}
window.__karma__.complete = function () {
  if (window.console) window.console.log('Skipped ' + this.skipped + ' tests')
}
window.__karma__.skipped = 0
window.__karma__.result = window.console
  ? function (result) {
    if (result.skipped) {
      this.skipped++
      return
    }
    const msg = result.success ? 'SUCCESS ' : 'FAILED '
    window.console.log(msg + result.suite.join(' ') + ' ' + result.description)

    result.log.forEach((err) => setTimeout((err) => window.console.error(err), 0, err))
  }
  : function () {}
window.__karma__.loaded = function () {
  this.start()
}
