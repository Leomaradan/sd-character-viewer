// we can also use `import`, but then
// every export should be explicitly defined

// eslint-disable-next-line @typescript-eslint/no-require-imports -- allowed in cjs files
const { fs } = require('memfs')
module.exports = fs