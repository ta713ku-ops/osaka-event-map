import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterSheet } from './FilterSheet';

describe('FilterSheet event tags', () => {
  afterEach(cleanup);

  it('applies evidence tags including free without a duplicate free control', () => {
    const onChange = vi.fn();
    render(<FilterSheet open value={{}} onChange={onChange} onClose={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: '無料' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '有名人来場' }));
    fireEvent.click(screen.getByRole('button', { name: '無料' }));
    fireEvent.click(screen.getByRole('button', { name: 'この条件で探す' }));
    expect(onChange).toHaveBeenCalledWith({ tags: ['celebrity', 'free'] });
  });

  it('keeps the expanded category labels available', () => {
    render(<FilterSheet open value={{}} onChange={vi.fn()} onClose={vi.fn()} categories={['music', 'theater', 'sports']} />);
    expect(screen.getByRole('button', { name: '音楽' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '演劇' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'スポーツ' })).toBeInTheDocument();
  });
});
