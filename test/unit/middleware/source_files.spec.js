const http = require('http')
const mocks = require('mocks')
const request = require('supertest')
const zlib = require('zlib')

const helper = require('../../../lib/helper')
const File = require('../../../lib/file')
const createServeFile = require('../../../lib/middleware/common').createServeFile
const createSourceFilesMiddleware = require('../../../lib/middleware/source_files').create

describe('middleware.source_files', function () {
  let next
  let files
  let server = next = files = null

  const fsMock = mocks.fs.create({
    base: {
      path: {
        'a.js': mocks.fs.file(0, 'js-src-a'),
        'index.html': mocks.fs.file(0, '<html>')
      }
    },
    src: {
      'some.js': mocks.fs.file(0, 'js-source')
    },
    utf8ášč: {
      'some.js': mocks.fs.file(0, 'utf8-file')
    },
    'jenkins%2Fbranch': {
      'some.js': mocks.fs.file(0, 'utf8-file')
    }
  })

  const serveFile = createServeFile(fsMock, null)

  function createServer (f, s, basePath) {
    const handler = createSourceFilesMiddleware(f.promise, s, basePath)
    return http.createServer(function (req, res) {
      next = sinon.spy(function (err) {
        if (err) {
          res.statusCode = err.status || 500
          return res.end(err.message)
        } else {
          res.statusCode = 200
          return res.end(JSON.stringify(req.body))
        }
      })

      return handler(req, res, next)
    })
  }

  beforeEach(function () {
    files = helper.defer()
    server = createServer(files, serveFile, '/base/path')
    return server
  })

  afterEach(function () {
    return next.resetHistory()
  })

  function servedFiles (list) {
    return files.resolve({ included: [], served: list })
  }

  describe('Range headers', function () {
    beforeEach(function () {
      servedFiles([
        new File('/src/some.js')
      ])
    })

    it('allows single explicit ranges', function () {
      return request(server)
        .get('/absolute/src/some.js')
        .set('Range', 'bytes=3-6')
        .expect('Content-Range', 'bytes 3-6/9')
        .expect(206, 'sour')
    })

    it('allows single range with no end', function () {
      return request(server)
        .get('/absolute/src/some.js')
        .set('Range', 'bytes=3-')
        .expect('Content-Range', 'bytes 3-8/9')
        .expect(206, 'source')
    })

    it('allows single range with suffix', function () {
      return request(server)
        .get('/absolute/src/some.js')
        .set('Range', 'bytes=-5')
        .expect('Content-Range', 'bytes 4-8/9')
        .expect(206, 'ource')
    })

    it('doesn\'t support multiple ranges', function () {
      return request(server)
        .get('/absolute/src/some.js')
        .set('Range', 'bytes=0-2,-3')
        .expect(416, '')
    })

    it('will return 416', function () {
      return request(server)
        .get('/absolute/src/some.js')
        .set('Range', 'bytes=20-')
        .expect(416, '')
    })
  })

  describe('file encoding', function () {
    let file
    beforeEach(function () {
      file = new File('/src/some.js')
      servedFiles([
        file
      ])
    })

    it('serves encoded files', function () {
      file.encodings.gzip = zlib.gzipSync('gzipped-js-source')
      return request(server)
        .get('/absolute/src/some.js')
        .set('Accept-Encoding', 'gzip, deflate')
        .expect(200, 'gzipped-js-source')
        .expect('Content-Encoding', 'gzip')
        .expect('Content-Type', 'application/javascript')
    })

    it('serves unencoded files when request does not accept available encodings', function (done) {
      file.encodings.gzip = zlib.gzipSync('gzipped-js-source')
      request(server)
        .get('/absolute/src/some.js')
        .set('Accept-Encoding', 'gzippy, deflate')
        .expect(200, 'js-source')
        .end((error, res) => {
          if (error) {
            return done(error)
          }
          expect(res.headers).to.not.have.property('content-encoding')
          return done()
        })
    })
  })

  it('should serve absolute js source files ignoring timestamp', function () {
    servedFiles([
      new File('/src/some.js')
    ])

    return request(server)
      .get('/absolute/src/some.js?123345')
      .expect(200, 'js-source')
  })

  it('should serve js source files from base folder ignoring timestamp', function () {
    servedFiles([
      new File('/base/path/a.js')
    ])

    return request(server)
      .get('/base/a.js?123345')
      .expect(200, 'js-src-a')
      .then(function () {
        return expect(next).not.to.have.been.called
      })
  })

  it('should send strict caching headers for js source files with sha', function () {
    servedFiles([
      new File('/src/some.js')
    ])

    return request(server)
      .get('/absolute/src/some.js?df43b8acf136389a8dd989bda397d1c9b4e048be')
      .expect('Cache-Control', 'public, max-age=31536000')
      .expect(200)
      .then(function () {
        return expect(next).not.to.have.been.called
      })
  })

  it('should send strict caching headers for js source files with sha (in basePath)', function () {
    servedFiles([
      new File('/base/path/a.js')
    ])

    return request(server)
      .get('/base/a.js?df43b8acf136389a8dd989bda397d1c9b4e048be')
      .expect('Cache-Control', 'public, max-age=31536000')
      .expect(200)
  })

  it('should send no-caching headers for js source files without timestamps', function () {
    const ZERO_DATE = new RegExp(new Date(0).toUTCString())

    servedFiles([
      new File('/src/some.js')
    ])

    return request(server)
      .get('/absolute/src/some.js')
      .expect('Cache-Control', 'no-cache')
      // idiotic IE8 needs more
      .expect('Pragma', 'no-cache')
      .expect('Expires', ZERO_DATE)
      .expect(200)
      .then(function () {
        return expect(next).not.to.have.been.called
      })
  })

  it('should not serve files that are not in served', function () {
    servedFiles([])

    return request(server)
      .get('/absolute/non-existing.html')
      .expect(200, '')
  })

  it('should serve 404 if file is served but does not exist', function () {
    servedFiles([
      new File('/non-existing.js')
    ])

    return request(server)
      .get('/absolute/non-existing.js')
      .expect(404, 'NOT FOUND')
  })

  it('should serve js source file from base path containing utf8 chars', function () {
    servedFiles([
      new File('/utf8ášč/some.js')
    ])

    server = createServer(files, serveFile, '/utf8ášč')

    return request(server)
      .get('/base/some.js')
      .expect(200, 'utf8-file')
      .then(function () {
        return expect(next).not.to.have.been.called
      })
  })

  it('should serve js source file from paths containing HTML URL encoded chars', function () {
    servedFiles([
      new File('/jenkins%2Fbranch/some.js')
    ])

    server = createServer(files, serveFile, '')

    return request(server)
      .get('/base/jenkins%2Fbranch/some.js')
      .expect(200, 'utf8-file')
      .then(function () {
        return expect(next).not.to.have.been.called
      })
  })

  it('should set content-type headers', function () {
    servedFiles([
      new File('/base/path/index.html')
    ])

    return request(server)
      .get('/base/index.html')
      .expect('Content-Type', 'text/html')
      .expect(200)
  })

  it('should use cached content if available', function () {
    const cachedFile = new File('/some/file.js')
    cachedFile.content = 'cached-content'

    servedFiles([
      cachedFile
    ])

    return request(server)
      .get('/absolute/some/file.js')
      .expect(200, 'cached-content')
      .then(function () {
        return expect(next).not.to.have.been.called
      })
  })

  return it('should not use cached content if doNotCache is set', function () {
    const cachedFile = new File('/src/some.js')
    cachedFile.content = 'cached-content'
    cachedFile.doNotCache = true

    servedFiles([
      cachedFile
    ])

    return request(server)
      .get('/absolute/src/some.js')
      .expect(200, 'js-source')
      .then(function () {
        return expect(next).not.to.have.been.called
      })
  })
})
