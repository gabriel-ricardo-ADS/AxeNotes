import { describe, expect, it } from 'vitest'
import { findViolations, isLicenseAllowed } from './check-licenses.mjs'

describe('isLicenseAllowed', () => {
  it.each(['MIT', 'ISC', 'Apache-2.0', 'MPL-2.0', 'BSD-3-Clause', 'GPL-3.0-or-later', 'LGPL-2.1'])(
    'accepts %s',
    (license) => {
      expect(isLicenseAllowed(license)).toBe(true)
    },
  )

  it.each(['GPL-2.0-only', 'AGPL-3.0', 'CC-BY-NC-4.0', 'SSPL-1.0', 'UNLICENSED', 'UNKNOWN', ''])(
    'rejects %s',
    (license) => {
      expect(isLicenseAllowed(license)).toBe(false)
    },
  )

  it('accepts an OR expression when one side is allowed', () => {
    expect(isLicenseAllowed('(MIT OR GPL-2.0-only)')).toBe(true)
  })

  it('rejects an OR expression when no side is allowed', () => {
    expect(isLicenseAllowed('(SSPL-1.0 OR AGPL-3.0)')).toBe(false)
  })

  it('requires both sides of an AND expression to be allowed', () => {
    expect(isLicenseAllowed('MIT AND CC0-1.0')).toBe(true)
    expect(isLicenseAllowed('MIT AND SSPL-1.0')).toBe(false)
  })

  it('handles nested expressions', () => {
    expect(isLicenseAllowed('(MIT OR Apache-2.0) AND (ISC OR SSPL-1.0)')).toBe(true)
    expect(isLicenseAllowed('(MIT OR Apache-2.0) AND (SSPL-1.0 OR AGPL-3.0)')).toBe(false)
  })

  it('rejects malformed expressions', () => {
    expect(isLicenseAllowed('MIT OR')).toBe(false)
    expect(isLicenseAllowed('(MIT')).toBe(false)
    expect(isLicenseAllowed('MIT)')).toBe(false)
  })

  it('only honours a package exception for that package', () => {
    expect(isLicenseAllowed('CC-BY-4.0')).toBe(false)
    expect(isLicenseAllowed('CC-BY-4.0', 'caniuse-lite')).toBe(true)
    expect(isLicenseAllowed('CC-BY-4.0', 'other-package')).toBe(false)
  })

  it('accepts OFL-1.1 only for the Inter font package', () => {
    expect(isLicenseAllowed('OFL-1.1')).toBe(false)
    expect(isLicenseAllowed('OFL-1.1', '@fontsource-variable/inter')).toBe(true)
    expect(isLicenseAllowed('OFL-1.1', '@fontsource/roboto')).toBe(false)
  })
})

describe('findViolations', () => {
  it('returns only packages whose license is not allowed', () => {
    const report = {
      MIT: [{ name: 'react', versions: ['19.0.0'] }],
      'AGPL-3.0': [{ name: 'bad-lib', versions: ['1.0.0', '2.0.0'] }],
      'CC-BY-4.0': [
        { name: 'caniuse-lite', versions: ['1.0.0'] },
        { name: 'other-data', versions: ['1.0.0'] },
      ],
    }

    expect(findViolations(report)).toEqual([
      { name: 'bad-lib', versions: ['1.0.0', '2.0.0'], license: 'AGPL-3.0' },
      { name: 'other-data', versions: ['1.0.0'], license: 'CC-BY-4.0' },
    ])
  })

  it('returns an empty list when everything is allowed', () => {
    expect(findViolations({ MIT: [{ name: 'react', versions: ['19.0.0'] }] })).toEqual([])
  })
})
