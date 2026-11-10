import { render, screen } from '@testing-library/react'
import { LoadingSpinner, LoadingOverlay, LoadingSection } from './loading-spinner'

describe('LoadingSpinner', () => {
  test('renders without text by default', () => {
    const { container } = render(<LoadingSpinner />)
    expect(container.querySelector('.triangle-spinner')).toBeInTheDocument()
    expect(screen.queryByText(/./, { selector: 'p' })).not.toBeInTheDocument()
  })

  test('renders the given text when provided', () => {
    render(<LoadingSpinner text="Đang tải dữ liệu..." />)
    expect(screen.getByText('Đang tải dữ liệu...')).toBeInTheDocument()
  })

  test('applies the size class corresponding to the size prop', () => {
    const { container } = render(<LoadingSpinner size="xl" />)
    expect(container.querySelector('.w-24.h-24')).toBeInTheDocument()
  })
})

describe('LoadingOverlay', () => {
  test('renders a default loading message', () => {
    render(<LoadingOverlay />)
    expect(screen.getByText('Đang tải...')).toBeInTheDocument()
  })
})

describe('LoadingSection', () => {
  test('renders a custom loading message', () => {
    render(<LoadingSection text="Đang tải báo cáo..." />)
    expect(screen.getByText('Đang tải báo cáo...')).toBeInTheDocument()
  })
})
