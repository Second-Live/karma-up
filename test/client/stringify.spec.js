/* global __karma__ */
const assert = require('chai').assert

const stringify = require('../../common/stringify')

describe('stringify', function () {
  it('should serialize symbols', function () {
    assert.deepStrictEqual(stringify(Symbol.for('x')), 'Symbol(x)')
  })

  it('should serialize string', function () {
    assert.deepStrictEqual(stringify('aaa'), "'aaa'")
  })

  it('should serialize booleans', function () {
    assert.deepStrictEqual(stringify(true), 'true')
    assert.deepStrictEqual(stringify(false), 'false')
  })

  it('should serialize null and undefined', function () {
    assert.deepStrictEqual(stringify(null), 'null')
    assert.deepStrictEqual(stringify(), 'undefined')
  })

  it('should serialize functions', function () {
    function abc (a, b, c) { return 'whatever' }
    function def (d, e, f) { return 'whatever' }

    const abcString = stringify(abc)
    const partsAbc = ['function', 'abc', '(a, b, c)', '{ ... }']
    const partsDef = ['function', '(d, e, f)', '{ ... }']

    partsAbc.forEach(function (part) {
      assert(abcString.indexOf(part) > -1)
    })

    const defString = stringify(def)
    partsDef.forEach(function (part) {
      assert(defString.indexOf(part) > -1)
    })
  })

  // Conditionally run Proxy tests as it's not supported by all browsers yet
  //   https://caniuse.com/proxy
  if (window.Proxy) {
    it('should serialize proxied functions', function () {
      const defProxy = new Proxy(function (d, e, f) { return 'whatever' }, {})
      // In Safari stringified Proxy object has ProxyObject as a name, but
      // in other browsers it does not.
      assert.deepStrictEqual(/^function (ProxyObject)?\(\) { ... }$/.test(stringify(defProxy)), true)
    })
  }

  it('should serialize arrays', function () {
    assert.deepStrictEqual(stringify(['a', 'b', null, true, false]), "['a', 'b', null, true, false]")
  })

  it('should serialize objects', function () {
    let obj = { a: 'a', b: 'b', c: null, d: true, e: false }
    assert(stringify(obj).indexOf("{a: 'a', b: 'b', c: null, d: true, e: false}") > -1)

    function MyObj () {
      this.a = 'a'
    }

    obj = new MyObj()
    assert(stringify(obj).indexOf("{a: 'a'}") > -1)

    obj = { constructor: null }

    const s = stringify(obj)
    assert(s.indexOf('{constructor: null}') > -1)

    obj = Object.create(null)
    obj.a = 'a'

    assert(stringify(obj).indexOf("{a: 'a'}") > -1)
  })

  it('should serialize html', function () {
    const div = document.createElement('div')

    assert.deepStrictEqual(stringify(div).trim().toLowerCase(), '<div></div>')

    div.innerHTML = 'some <span>text</span>'
    assert.deepStrictEqual(stringify(div).trim().toLowerCase(), '<div>some <span>text</span></div>')
  })

  it('should serialize error', function () {
    const error = new TypeError('Error description')
    assert(stringify(error).indexOf('Error description') > -1)
  })

  it('should serialize DOMParser objects', function () {
    const parser = new DOMParser()
    const doc = parser.parseFromString('<test></test>', 'application/xml')
    assert.deepStrictEqual(stringify(doc), '<test/>')
  })

  it('should serialize across iframes', function () {
    const div = document.createElement('div')
    assert.deepStrictEqual(__karma__.stringify(div).trim().toLowerCase(), '<div></div>')

    assert.deepStrictEqual(__karma__.stringify([1, 2]), '[1, 2]')
  })

  it('should stringify object with property tagName as Object', function () {
    assert(stringify({ tagName: 'a' }).indexOf("{tagName: 'a'}") > -1)
  })
})
