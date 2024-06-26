const sinon = require('sinon')
const assert = require('chai').assert

const ClientKarma = require('../../client/karma')
const ContextKarma = require('../../context/karma')
const MockSocket = require('./mocks').Socket

describe('Karma', function () {
  let updater,
    socket,
    k,
    ck,
    windowNavigator,
    windowLocation,
    windowStub,
    startSpy,
    iframe,
    clientWindow
  let windowDocument, elements, mockTestStatus

  beforeEach(function () {
    mockTestStatus = ''
    updater = {
      updateTestStatus: function (s) {
        mockTestStatus = s
      }
    }
    socket = new MockSocket()
    iframe = { contentWindow: {} }
    windowNavigator = {}
    windowLocation = { search: '' }
    windowStub = sinon.stub().returns({})
    elements = [{ style: {} }, { style: {} }]
    windowDocument = { querySelectorAll: sinon.stub().returns(elements) }

    k = new ClientKarma(
      updater,
      socket,
      iframe,
      windowStub,
      windowNavigator,
      windowLocation,
      windowDocument
    )
    clientWindow = {
      karma: k
    }
    ck = new ContextKarma(
      ContextKarma.getDirectCallParentKarmaMethod(clientWindow)
    )
    ck.config = {}
    startSpy = sinon.spy(ck, 'start')
  })

  afterEach(function () {
    sinon.restore()
  })

  it('should start execution when all files loaded and pass config', function () {
    const config = (ck.config = {
      useIframe: true
    })

    socket.emitMessage('execute', config)
    assert(!startSpy.called)

    ck.loaded()
    assert(startSpy.calledWith(config))
  })

  it('should open a new window when useIFrame is false', function (done) {
    const config = (ck.config = {
      useIframe: false,
      runInParent: false
    })

    socket.emitMessage('execute', config)
    setTimeout(function nextEventLoop() {
      assert(!ck.start.called)

      ck.loaded()
      assert(startSpy.calledWith(config))
      assert(windowStub.calledWith('context.html'))
      done()
    })
  })

  it('should not set style on elements', function (done) {
    const config = {}
    socket.emitMessage('execute', config)
    setTimeout(function nextEventLoop() {
      assert(Object.keys(elements[0].style).length === 0)
      done()
    })
  })

  it('should set display none on elements if clientDisplayNone', function (done) {
    const config = { clientDisplayNone: true }
    socket.emitMessage('execute', config)
    setTimeout(function nextEventLoop() {
      assert(elements[0].hidden === true)
      assert(elements[1].hidden === true)
      done()
    })
  })

  it('should stop execution', function () {
    sinon.spy(k, 'complete')
    socket.emitMessage('stop')
    assert(k.complete.called)
  })

  it('should not start execution if any error during loading files', function () {
    ck.error('syntax error', '/some/file.js', 11)
    ck.loaded()
    sinon.spy(ck, 'start')
    assert(!startSpy.called)
  })

  it('should remove reference to start even after syntax error', function () {
    function ADAPTER_START_FN() {}

    ck.start = ADAPTER_START_FN
    ck.error('syntax error', '/some/file.js', 11)
    ck.loaded()
    assert.notStrictEqual(ck.start, ADAPTER_START_FN)

    ck.start = ADAPTER_START_FN
    ck.loaded()
    assert.notStrictEqual(k.start, ADAPTER_START_FN)
  })

  it('should not set up context if there was an error', function (done) {
    const config = (ck.config = {
      clearContext: true
    })

    socket.emitMessage('execute', config)

    setTimeout(function nextEventLoop() {
      const mockWindow = {}

      ck.error('page reload')
      ck.setupContext(mockWindow)

      assert(mockWindow.onbeforeunload == null)
      assert(mockWindow.onerror == null)
      done()
    })
  })

  it('should setup context if there was error but clearContext config is false', function (done) {
    const config = (ck.config = {
      clearContext: false
    })

    socket.emitMessage('execute', config)

    setTimeout(function nextEventLoop() {
      const mockWindow = {}

      ck.error('page reload')
      ck.setupContext(mockWindow)

      assert(mockWindow.onbeforeunload != null)
      assert(mockWindow.onerror != null)
      done()
    })
  })

  it('should error out if a script attempted to reload the browser after setup', function (done) {
    // Perform setup
    const config = (ck.config = {
      clearContext: false
    })
    socket.emitMessage('execute', config)

    setTimeout(function nextEventLoop() {
      const mockWindow = {}
      ck.setupContext(mockWindow)

      // Spy on our error handler
      sinon.spy(k, 'error')

      // Emulate an unload event
      mockWindow.onbeforeunload()

      // Assert our spy was called
      assert(k.error.calledWith('Some of your tests did a full page reload!'))
      done()
    })
  })

  it('should error out if a script attempted to reload the browser after setup with clearContext true', function (done) {
    // Perform setup
    const config = (ck.config = {
      clearContext: true
    })
    socket.emitMessage('execute', config)

    setTimeout(function nextEventLoop() {
      const mockWindow = {}
      ck.setupContext(mockWindow)

      // Spy on our error handler
      sinon.spy(k, 'error')

      // Emulate an unload event
      mockWindow.onbeforeunload()

      // Assert our spy was called
      assert(k.error.calledWith('Some of your tests did a full page reload!'))
      done()
    })
  })

  it('should report navigator name', function () {
    sinon.spy(socket, 'emit')
    windowNavigator.userAgent = 'Fake browser name'
    windowLocation.search = ''
    socket.emit('open')

    assert(socket.emit.calledWith('register'))
  })

  it('should report browser id', function () {
    windowLocation.search = '?id=567'
    socket = new MockSocket()
    k = new ClientKarma(
      updater,
      socket,
      {},
      windowStub,
      windowNavigator,
      windowLocation
    )

    sinon.spy(socket, 'emit')
    socket.emit('open')

    assert(socket.emit.calledWith('register', sinon.match({ id: '567' })))
  })

  describe('result', function () {
    it('should emit "start" with total specs count first', function () {
      sinon.spy(socket, 'emit')
      // adapter didn't call info({total: x})
      ck.result()

      assert(socket.emit.getCall(0).firstArg === 'start')
      assert(socket.emit.getCall(1).firstArg === 'result')
    })

    it('should not emit "start" if already done by the adapter', function () {
      sinon.spy(socket, 'emit')

      ck.info({ total: 321 })
      ck.result()
      assert(socket.emit.getCall(0).calledWith('start', { total: 321 }))
      assert(socket.emit.getCall(1).firstArg === 'result')
    })
  })

  describe('setupContext', function () {
    it('should capture alert', function () {
      sinon.spy(ck, 'log')

      const mockWindow = {
        alert: function () {
          throw new Error('Alert was not patched!')
        }
      }

      ck.setupContext(mockWindow)
      mockWindow.alert('What?')
      assert(ck.log.calledWith('alert', ['What?']))
    })

    it('should capture confirm', function () {
      sinon.spy(ck, 'log')
      let confirmCalled = false

      const mockWindow = {
        confirm: function () {
          confirmCalled = true
          return true
        }
      }

      ck.setupContext(mockWindow)
      const confirmResult = mockWindow.confirm('What?')
      assert(ck.log.calledWith('confirm', ['What?']))
      assert.strictEqual(confirmCalled, true)
      assert.strictEqual(confirmResult, true)
    })

    it('should capture prompt', function () {
      sinon.spy(ck, 'log')
      let promptCalled = false

      const mockWindow = {
        prompt: function () {
          promptCalled = true
          return 'user-input'
        }
      }

      ck.setupContext(mockWindow)
      const promptResult = mockWindow.prompt(
        'What is your favorite color?',
        'blue'
      )
      assert(
        ck.log.calledWith('prompt', ['What is your favorite color?', 'blue'])
      )
      assert.strictEqual(promptCalled, true)
      assert.strictEqual(promptResult, 'user-input')
    })

    it('should patch the console if captureConsole is true', function () {
      sinon.spy(ck, 'log')
      ck.config.captureConsole = true

      const mockWindow = {
        console: {
          log: function () {}
        }
      }

      ck.setupContext(mockWindow)
      mockWindow.console.log('What?')
      assert(ck.log.calledWith('log'))
      assert(ck.log.args[0][1][0] === 'What?')
    })

    it('should not patch the console if captureConsole is false', function () {
      sinon.spy(ck, 'log')
      ck.config.captureConsole = false

      const mockWindow = {
        console: {
          log: function () {}
        }
      }

      ck.setupContext(mockWindow)
      mockWindow.console.log('hello')
      assert(!ck.log.called)
    })

    it('should not allow broken console methods to break tests (if captureConsole is true)', function () {
      sinon.spy(ck, 'log')
      ck.config.captureConsole = true

      const mockWindow = {
        console: {
          log: function () {
            throw new Error('I am a broken console.log method.')
          }
        }
      }

      ck.setupContext(mockWindow)
      mockWindow.console.log('What?')
      assert(ck.log.calledWith('log'))
      assert.strictEqual(ck.log.args[0][1][0], 'What?')
      assert(ck.log.calledWith('warn'))
      assert(
        /^Console method log threw:[\s\S]+I am a broken console\.log method/.test(
          ck.log.args[1][1][0]
        )
      )
    })
  })

  describe('complete', function () {
    let clock

    before(function () {
      clock = sinon.useFakeTimers()
    })

    after(function () {
      clock.restore()
    })

    it('should navigate the client to return_url if specified and allowed', function (done) {
      const config = {
        // The default value.
        allowedReturnUrlPatterns: ['^https?://']
      }
      windowLocation.search = '?id=567&return_url=http://return.com'
      socket = new MockSocket()
      k = new ClientKarma(
        updater,
        socket,
        iframe,
        windowStub,
        windowNavigator,
        windowLocation
      )
      clientWindow = { karma: k }
      ck = new ContextKarma(
        ContextKarma.getDirectCallParentKarmaMethod(clientWindow)
      )
      socket.emitMessage('execute', config)

      clock.tick(500)

      ck.complete()
      setTimeout(function () {
        assert(windowLocation.href === 'http://return.com')
        done()
      }, 5)

      clock.tick(10)
    })

    it('should not navigate the client to return_url if not allowed', function () {
      const config = {
        allowedReturnUrlPatterns: []
      }

      windowLocation.search =
        '?id=567&return_url=javascript:alert(document.domain)'
      socket = new MockSocket()
      k = new ClientKarma(
        updater,
        socket,
        iframe,
        windowStub,
        windowNavigator,
        windowLocation
      )
      clientWindow = { karma: k }
      ck = new ContextKarma(
        ContextKarma.getDirectCallParentKarmaMethod(clientWindow)
      )
      socket.emitMessage('execute', config)

      try {
        ck.complete()
        throw new Error('An error should have been caught.')
      } catch (error) {
        assert(
          /Error: Security: Navigation to .* was blocked to prevent malicious exploits./.test(
            error
          )
        )
      }
    })

    it('should clear context window upon complete when clearContext config is true', function () {
      const config = (ck.config = {
        clearContext: true
      })

      socket.emit('execute', config)
      const CURRENT_URL = iframe.src

      ck.complete()

      // clock.tick() does not work in IE 7
      setTimeout(function () {
        clock.tick(1)
        assert.notStrictEqual(iframe.src, CURRENT_URL)
      }, 10)
    })

    it('should not clear context window upon complete when clearContext config is false', function () {
      const config = (ck.config = {
        clearContext: false
      })

      socket.emitMessage('execute', config)
      assert(mockTestStatus === 'execute')

      clock.tick(1)
      const CURRENT_URL = iframe.src
      ck.complete()
      clock.tick(1)
      assert.strictEqual(iframe.src, CURRENT_URL)
      assert(mockTestStatus === 'complete')
    })

    it('should accept multiple calls to loaded', function () {
      // support for Safari 10 since it supports type=module but not nomodule.
      const config = (ck.config = {
        useIframe: true
      })

      socket.emitMessage('execute', config)
      clock.tick(1)
      assert(!startSpy.called)

      ck.loaded()
      ck.loaded()
      assert(startSpy.calledWith(config))
      assert(startSpy.getCalls().length === 1)
    })
  })
})
