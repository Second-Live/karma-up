let object = {}

module.exports = function (config) {
  config.set(object)
}

module.exports.setObject = function (obj) {
  object = obj
}
