const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const bumpType = process.argv[2]
if (!['patch', 'minor', 'major'].includes(bumpType)) {
    console.error('Usage: node scripts/release.js <patch|minor|major>')
    process.exit(1)
}

const pkgPath = path.join(__dirname, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

const [major, minor, patch] = pkg.version.split('.').map(Number)
let newVersion
if (bumpType === 'major') newVersion = `${major + 1}.0.0`
else if (bumpType === 'minor') newVersion = `${major}.${minor + 1}.0`
else newVersion = `${major}.${minor}.${patch + 1}`

pkg.version = newVersion
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

console.log(`Version bumped: ${pkg.version.replace(newVersion, '')}${newVersion}`)

execSync('git add package.json', { stdio: 'inherit' })
execSync(`git commit -m "chore: release v${newVersion}"`, { stdio: 'inherit' })
execSync(`git tag v${newVersion}`, { stdio: 'inherit' })

console.log(`\nTag v${newVersion} created.`)
console.log('Run: git push origin master --follow-tags')
