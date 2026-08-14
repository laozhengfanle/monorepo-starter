import { render, screen } from '@testing-library/react';
import { StatusTag } from './status-tag';

describe('StatusTag', () => {
  it('active → 绿色标签', () => {
    render(<StatusTag status="active" />);
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('disabled → 橙色标签', () => {
    render(<StatusTag status="disabled" />);
    const tag = screen.getByText('disabled');
    expect(tag).toBeInTheDocument();
    expect(tag.closest('.ant-tag')).toHaveClass('ant-tag-orange');
  });

  it('locked → 红色标签', () => {
    render(<StatusTag status="locked" />);
    expect(screen.getByText('locked').closest('.ant-tag')).toHaveClass('ant-tag-red');
  });

  it('未知状态 → 默认灰色标签且不报错', () => {
    render(<StatusTag status={'unknown' as never} />);
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });
});
