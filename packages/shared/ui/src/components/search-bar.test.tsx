import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SearchBar, type SearchField, type SearchValues } from './search-bar';

const fields: SearchField[] = [
  {
    name: 'username',
    label: '用户名',
    type: 'input',
    placeholder: '请输入用户名',
  },
  {
    name: 'roleCode',
    label: '角色',
    type: 'select',
    placeholder: '全部',
    options: [
      { value: 'admin', label: '管理员' },
      { value: 'viewer', label: '访客' },
    ],
  },
  {
    name: 'includeDeleted',
    label: '',
    type: 'checkbox',
    checkLabel: '显示已删除',
  },
];

// antd v6 对 2 个中文字符的按钮文本自动插入空格（"查询" → "查 询"），用正则匹配
const QUERY_BTN = /查\s*询/;
const RESET_BTN = /重\s*置/;

describe('SearchBar', () => {
  it('渲染字段标签与占位符', () => {
    render(
      <SearchBar
        fields={fields}
        onSearch={vi.fn<(v?: SearchValues) => void>()}
      />,
    );

    expect(screen.getByText('用户名')).toBeTruthy();
    expect(screen.getByPlaceholderText('请输入用户名')).toBeTruthy();
    expect(screen.getByText('角色')).toBeTruthy();
    expect(screen.getByText('显示已删除')).toBeTruthy();
  });

  it('渲染查询/重置按钮（均无 icon 依赖）', () => {
    render(
      <SearchBar
        fields={fields}
        onSearch={vi.fn<(v?: SearchValues) => void>()}
      />,
    );

    expect(screen.getByText(QUERY_BTN)).toBeTruthy();
    expect(screen.getByText(RESET_BTN)).toBeTruthy();
  });

  it('点击查询 → onSearch 收到表单值', async () => {
    const onSearch = vi.fn<(v?: SearchValues) => void>();
    render(<SearchBar fields={fields} onSearch={onSearch} />);

    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), {
      target: { value: 'root' },
    });
    fireEvent.click(screen.getByText(QUERY_BTN));

    await waitFor(() => {
      expect(onSearch).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'root' }),
      );
    });
  });

  it('点击重置 → 清空表单并触发 onReset', () => {
    const onReset = vi.fn<(v?: SearchValues) => void>();
    render(
      <SearchBar
        fields={fields}
        onSearch={vi.fn<(v?: SearchValues) => void>()}
        onReset={onReset}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), {
      target: { value: 'root' },
    });
    fireEvent.click(screen.getByText(RESET_BTN));

    expect(onReset).toHaveBeenCalled();
    // 重置后输入框清空
    expect(
      (screen.getByPlaceholderText('请输入用户名') as HTMLInputElement).value,
    ).toBe('');
  });
});
