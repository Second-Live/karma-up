'use strict'

const path = require('path')

describe('helper', () => {
  const helper = require('../../lib/helper')

  describe('browserFullNameToShort', () => {
    // helper function
    const expecting = (name) => expect(helper.browserFullNameToShort(name))

    it('should parse iOS', () => {
      expecting(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 6_0 like Mac OS X) AppleWebKit/536.26 ' +
        '(KHTML, like Gecko) Version/6.0 Mobile/10A403 Safari/8536.25'
      )
        .to.be.equal('Mobile Safari 6.0 (iOS 6.0)')
    })

    it('should parse Linux', () => {
      expecting(
        'Mozilla/5.0 (X11; U; Linux i686; en-US; rv:1.8.1.19) Gecko/20081216 ' +
        'Ubuntu/8.04 (hardy) Firefox/2.0.0.19'
      )
        .to.be.equal('Firefox 2.0.0.19 (Ubuntu 8.04)')
    })

    it('should degrade gracefully when OS not recognized', () => {
      expecting(
        'Mozilla/5.0 (X11; U; FreeBSD; i386; en-US; rv:1.7) Gecko/20081216 ' +
        'Firefox/2.0.0.19'
      ).to.be.equal('Firefox 2.0.0.19 (FreeBSD 0.0.0)')
    })

    it('should parse Chrome', () => {
      expecting(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.7 ' +
        '(KHTML, like Gecko) Chrome/16.0.912.63 Safari/535.7'
      )
        .to.be.equal('Chrome 16.0.912.63 (Mac OS 10.6.8)')

      expecting(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.15 ' +
        '(KHTML, like Gecko) Chrome/18.0.985.0 Safari/535.15'
      )
        .to.be.equal('Chrome 18.0.985.0 (Mac OS 10.6.8)')
    })

    it('should parse Firefox', () => {
      expecting(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.6; rv:7.0.1) Gecko/20100101 ' +
        'Firefox/7.0.1'
      )
        .to.be.equal('Firefox 7.0.1 (Mac OS 10.6)')
    })

    it('should parse Opera', () => {
      expecting(
        'Opera/9.80 (Macintosh; Intel Mac OS X 10.6.8; U; en) Presto/2.9.168 ' +
        'Version/11.52'
      )
        .to.be.equal('Opera 11.52 (Mac OS 10.6.8)')
    })

    it('should parse Safari', () => {
      expecting(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/534.52.7 ' +
        '(KHTML, like Gecko) Version/5.1.2 Safari/534.52.7'
      )
        .to.be.equal('Safari 5.1.2 (Mac OS 10.6.8)')
    })

    it('should parse PhantomJS', () => {
      expecting(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/534.34 (KHTML, like Gecko) ' +
        'PhantomJS/1.6.0 Safari/534.34'
      )
        .to.be.equal('PhantomJS 1.6.0 (Mac OS 0.0.0)')
    })

    // Fix for #318
    it('should parse old Android Browser', () => {
      expecting(
        'Mozilla/5.0 (Linux; U; Android 4.2; en-us; sdk Build/JB_MR1) ' +
        'AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30'
      )
        .to.be.equal('Android Browser 4.0 (Android 4.2)')
    })

    it('should parse Headless Chrome', () => {
      expecting(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'HeadlessChrome/70.0.3538.77 Safari/537.36'
      )
        .to.be.equal('Chrome Headless 70.0.3538.77 (Linux x86_64)')
    })

    it('should parse MS Edge Chromium', () => {
      expecting(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/80.0.3987.132 Safari/537.36 Edg/80.0.361.66'
      )
        .to.be.equal('Edge 80.0.361.66 (Windows 10)')
    })
  })

  describe('isDefined', () => {
    const isDefined = helper.isDefined

    it('should return true if defined', () => {
      expect(isDefined()).to.equal(false)
      expect(isDefined(undefined)).to.equal(false)

      expect(isDefined(false)).to.equal(true)
      expect(isDefined(0)).to.equal(true)
      expect(isDefined(null)).to.equal(true)
      expect(isDefined('')).to.equal(true)
    })
  })

  describe('camelToSnake', () => {
    const camelToSnake = helper.camelToSnake

    it('should convert camelCase string to snake_case', () => {
      expect(camelToSnake('OneMoreThing')).to.equal('one_more_thing')
    })
  })

  describe('dashToCamel', () => {
    const dashToCamel = helper.dashToCamel

    it('should convert dash-case to camelCase', () => {
      expect(dashToCamel('one-more-thing')).to.equal('oneMoreThing')
      expect(dashToCamel('one')).to.equal('one')
    })
  })

  describe('arrayRemove', () => {
    const arrayRemove = helper.arrayRemove

    it('should remove object from array', () => {
      const a = 'one'
      const b = []
      const c = {}
      const d = () => null
      const collection = [a, b, c, d]

      expect(arrayRemove(collection, b)).to.equal(true)
      expect(collection).to.deep.equal([a, c, d])

      expect(arrayRemove(collection, {})).to.equal(false)
      expect(collection).to.deep.equal([a, c, d])

      expect(arrayRemove(collection, d)).to.equal(true)
      expect(collection).to.deep.equal([a, c])

      expect(arrayRemove(collection, a)).to.equal(true)
      expect(collection).to.deep.equal([c])
    })
  })

  describe('merge', () => {
    it('should copy properties to first argument', () => {
      const destination = { a: 1, b: 2 }
      const result = helper.merge(destination, { a: 4, c: 5 })

      expect(destination.a).to.equal(1)
      expect(result).to.deep.equal({ a: 4, b: 2, c: 5 })
    })
  })

  describe('isUrlAbsolute', () => {
    it('should check http/https protocol', () => {
      expect(helper.isUrlAbsolute('some/path/http.html')).to.equal(false)
      expect(helper.isUrlAbsolute('/some/more.py')).to.equal(false)
      expect(helper.isUrlAbsolute('http://some.com/path')).to.equal(true)
      expect(helper.isUrlAbsolute('https://more.org/some.js')).to.equal(true)
    })
  })

  describe('formatTimeInterval', () => {
    it('should format into seconds', () => {
      expect(helper.formatTimeInterval(23000)).to.equal('23 secs')
    })

    it('should format into minutes', () => {
      expect(helper.formatTimeInterval(142000)).to.equal('2 mins 22 secs')
    })

    it('should handle singular minute or second', () => {
      expect(helper.formatTimeInterval(61000)).to.equal('1 min 1 sec')
    })

    it('should round to miliseconds', () => {
      expect(helper.formatTimeInterval(163017)).to.equal('2 mins 43.017 secs')
    })
  })

  describe('mkdirIfNotExists', () => {
    const loadFile = require('mocks').loadFile

    const spy = sinon.spy()

    // load file under test
    const m = loadFile(path.join(__dirname, '/../../lib/helper.js'), {
      fs: {
        mkdir (path, options, done) {
          spy(path)
          done()
        }
      }
    })

    const mkdirIfNotExists = m.exports.mkdirIfNotExists

    it('should call mkdir from fs', (done) => {
      mkdirIfNotExists('/path/to/dir', () => {
        expect(spy).to.have.been.calledOnceWith('/path/to/dir')
        done()
      })
    })
  })

  describe('mmComparePatternWeights', () => {
    const helper = require('../../lib/helper')
    it('should compare right on equal', () => {
      helper.mmComparePatternWeights([1, 2, 3], [1, 2, 3]).should.be.equal(0)
    })

    it('should compare right on less', () => {
      helper.mmComparePatternWeights([1, 2, 3], [1, 2, 5]).should.be.equal(-1)
    })

    it('should compare right on greater than', () => {
      helper.mmComparePatternWeights([1, 3, 3], [1, 2, 5]).should.be.equal(1)
    })

    it('should compare right on larger size', () => {
      helper.mmComparePatternWeights([1, 2, 3, 4], [1, 2, 3, 4]).should.be.equal(0)
    })
  })

  describe('mmPatternWeight', () => {
    const helper = require('../../lib/helper')
    it('should calculate right weight of empty', () => {
      helper.mmPatternWeight('').should.be.deep.equal([0, 0, 0, 0, 0, 0])
    })
    it('should calculate right weight of pattern with no magic', () => {
      helper.mmPatternWeight('foo').should.be.deep.equal([1, 0, 0, 0, 0, 0])
    })
    it('should calculate right weight of pattern with optional', () => {
      helper.mmPatternWeight('foo?').should.be.deep.equal([1, 0, 0, 0, 0, 1])
    })
    it('should calculate right weight of pattern with range', () => {
      helper.mmPatternWeight('[fo]').should.be.deep.equal([1, 0, 0, 0, 1, 0])
    })
    it('should calculate right weight of pattern with glob sets', () => {
      helper.mmPatternWeight('{0..9}').should.be.deep.equal([10, 0, 0, 0, 0, 0])
    })
    it('should calculate right weight of pattern with two glob sets', () => {
      helper.mmPatternWeight('{a,b}').should.be.deep.equal([2, 0, 0, 0, 0, 0])
    })
    it('should calculate right weight of pattern with ext glob', () => {
      helper.mmPatternWeight('+(a|b)').should.be.deep.equal([1, 0, 0, 1, 0, 0])
    })
    it('should calculate right weight of pattern with ext glob misuse', () => {
      helper.mmPatternWeight('(a|b)').should.be.deep.equal([1, 0, 0, 0, 0, 0])
    })
    it('should calculate right weight of pattern with star', () => {
      helper.mmPatternWeight('*').should.be.deep.equal([1, 0, 1, 0, 0, 0])
    })
    it('should calculate right weight of pattern with glob star', () => {
      helper.mmPatternWeight('**/a').should.be.deep.equal([1, 1, 0, 0, 0, 0])
    })
    it('should calculate right weight of pattern with misused glob star', () => {
      helper.mmPatternWeight('***/a').should.be.deep.equal([1, 0, 3, 0, 0, 0])
    })
    it('should calculate right weight of pattern with more magic', () => {
      helper.mmPatternWeight('{0..9}/?(a|b)c/[abc]/**/*.jsx?').should.be.deep.equal([10, 1, 1, 1, 1, 1])
    })
    it('should calculate right weight of pattern as worst glob set', () => {
      helper.mmPatternWeight('{**,*}').should.be.deep.equal([2, 1, 0, 0, 0, 0])
    })
  })

  describe('saveOriginalArgs', () => {
    it('should clone config.client.args', () => {
      const config = {
        client: {
          args: ['--somearg']
        }
      }
      expect(config.client.originalArgs).to.not.exist
      helper.saveOriginalArgs(config)
      config.client.args.should.be.deep.equal(['--somearg'])
      config.client.originalArgs.should.be.deep.equal(['--somearg'])
    })
  })

  describe('restoreOriginalArgs', () => {
    it('should restore config.client.originalArgs', () => {
      const config = {
        client: {
          args: ['--somearg'],
          originalArgs: []
        }
      }
      helper.restoreOriginalArgs(config)
      config.client.args.should.be.deep.equal([])
      config.client.originalArgs.should.be.deep.equal([])
    })
  })
})
