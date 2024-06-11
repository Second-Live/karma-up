const { rollup, watch } = require('rollup')
const { readFile } = require('fs').promises

const bundleResourceToFile = async (inPath, outPath) => {
  const build = await rollup({
    input: inPath,
    plugins: [require('@rollup/plugin-commonjs')()]
  })
  await build.write({ file: outPath, format: 'iife' })
  build.close()
}

const bundleResource = async (inPath) => {
  const build = await rollup({
    input: inPath,
    plugins: [require('@rollup/plugin-commonjs')()]
  })
  const generated = await build.generate({ format: 'iife' })
  build.close()
  return Buffer.from(generated.output[0].code)
}

const watchResourceToFile = async (inPath, outPath) => {
  watch({
    input: inPath,
    plugins: [require('@rollup/plugin-commonjs')()],
    output: { file: outPath, format: 'iife' }
  })
}

const main = async () => {
  if (process.argv[2] === 'build') {
    await bundleResourceToFile('client/main.js', 'static/karma.js')
    await bundleResourceToFile('context/main.js', 'static/context.js')
  } else if (process.argv[2] === 'check') {
    const expectedClient = await bundleResource('client/main.js')
    const expectedContext = await bundleResource('context/main.js')

    const actualClient = await readFile('static/karma.js')
    const actualContext = await readFile('static/context.js')

    if (
      Buffer.compare(expectedClient, actualClient) !== 0 ||
      Buffer.compare(expectedContext, actualContext) !== 0
    ) {
      // eslint-disable-next-line no-throw-literal
      throw 'Bundled client assets are outdated. Forgot to run "npm run build"?'
    }
  } else if (process.argv[2] === 'watch') {
    watchResourceToFile('client/main.js', 'static/karma.js')
    watchResourceToFile('context/main.js', 'static/context.js')
  } else {
    // eslint-disable-next-line no-throw-literal
    throw `Unknown command: ${process.argv[2]}`
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
