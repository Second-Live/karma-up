const { After, Before } = require('@cucumber/cucumber')

Before(function () {
  this.ensureSandbox()
})

After(async function () {
  await this.proxy.stopIfRunning()
  await this.stopBackgroundProcessIfRunning()
})
