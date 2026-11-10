import { apiFetch, ApiError } from './client'

describe('apiFetch', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    jest.resetAllMocks()
  })

  test('attaches the Authorization header when a token is stored', async () => {
    sessionStorage.setItem('auth_token', 'my-token')
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hello: 'world' }),
    })
    global.fetch = mockFetch as any

    const data = await apiFetch('/api/ping')

    expect(data).toEqual({ hello: 'world' })
    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers.Authorization).toBe('Bearer my-token')
  })

  test('omits the Authorization header when auth: false is passed', async () => {
    sessionStorage.setItem('auth_token', 'my-token')
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })
    global.fetch = mockFetch as any

    await apiFetch('/api/public', { auth: false })

    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers.Authorization).toBeUndefined()
  })

  test('throws an ApiError with the backend status and message on a non-OK response', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'Không tìm thấy phim' }),
    })
    global.fetch = mockFetch as any

    await expect(apiFetch('/api/movies/999')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Không tìm thấy phim',
    })
  })

  test('normalizes a network failure into an ApiError instead of throwing a raw error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) as any

    await expect(apiFetch('/api/movies')).rejects.toBeInstanceOf(ApiError)
  })
})
