/** @jest-environment node */

import { NextRequest } from 'next/server'

import { proxy } from './proxy'

function request(url: string, host: string) {
  return new NextRequest(url, {
    headers: { host },
  })
}

describe('Quipsly host routing', () => {
  it.each([
    ['/privacy', 'https://quipsly.com/privacy'],
    [
      '/privacy/account-deletion?source=ios',
      'https://quipsly.com/privacy/account-deletion?source=ios',
    ],
  ])(
    'removes the internal Cloud Run port from public-policy redirects',
    (path, expected) => {
      const response = proxy(
        request(`https://nest.quipsly.com:8080${path}`, 'nest.quipsly.com'),
      )

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(expected)
    },
  )

  it('removes the internal port from the legacy studio-domain redirect', () => {
    const response = proxy(
      request(
        'https://quipsly.studio:8080/privacy?source=legacy',
        'quipsly.studio',
      ),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://quipsly.com/privacy?source=legacy',
    )
  })

  it('keeps private work on the canonical Nest host', () => {
    const response = proxy(
      request('https://quipsly.com:8080/work?q=episode', 'quipsly.com'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://nest.quipsly.com/work?q=episode',
    )
  })
})
