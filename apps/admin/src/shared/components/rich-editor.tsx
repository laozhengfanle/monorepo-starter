import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Divider, Tooltip } from 'antd';
import { EditorContent, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TextAlign } from '@tiptap/extension-text-align';
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  BoldOutlined,
  BorderOuterOutlined,
  CodeOutlined,
  ColumnWidthOutlined,
  DeleteColumnOutlined,
  DeleteRowOutlined,
  DeleteOutlined,
  EditOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  InsertRowAboveOutlined,
  InsertRowBelowOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  PictureOutlined,
  RedoOutlined,
  StrikethroughOutlined,
  TableOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useTheme } from '../../app/providers/theme-provider.js';
import { uploadFileApi } from '../utils/upload.js';
import { sanitizeRichHtml } from '../utils/sanitize-html.js';

/**
 * 富文本编辑器（Tiptap 3，React 受控组件）
 *
 * 设计要点：
 * - value/onChange 双向绑定：父组件只关心 HTML 字符串
 * - 图片上传走 /api/upload（存储驱动，默认本地落盘），插入 url
 * - XSS 防护：onUpdate 时用 DOMPurify 白名单清洗后再 emit
 * - 暗黑模式：跟随 useTheme().resolved，工具栏/编辑区样式自适应
 * - 工具栏：加粗/斜体/下划线/删除线/标题/列表/对齐/引用/代码块/表格/链接/图片/撤销重做/全屏
 */

export interface RichEditorProps {
  /** 编辑器 HTML 内容 */
  value: string;
  /** 内容变化（已清洗） */
  onChange: (html: string) => void;
  /** 空提示 */
  placeholder?: string;
  /** 最小高度（px） */
  minHeight?: number;
  /** 是否只读 */
  disabled?: boolean;
}

/** 工具栏按钮（通用渲染壳） */
function ToolbarButton({
  onClick,
  active,
  disabled,
  icon,
  label,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
}): React.JSX.Element {
  return (
    <Tooltip title={label}>
      <Button
        type="text"
        size="small"
        icon={icon}
        disabled={disabled}
        onClick={onClick}
        style={
          active
            ? { color: '#1677ff', background: 'rgba(22,119,255,0.12)' }
            : undefined
        }
        aria-label={label}
      />
    </Tooltip>
  );
}

export function RichEditor({
  value,
  onChange,
  placeholder = '请输入内容...',
  minHeight = 300,
  disabled = false,
}: RichEditorProps): React.JSX.Element {
  const { message } = App.useApp();
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
      Image.configure({ inline: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
    ],
    content: sanitizeRichHtml(value),
    editable: !disabled,
    onUpdate: ({ editor: e }) => {
      onChange(sanitizeRichHtml(e.getHTML()));
    },
  });

  // 外部 value 变化时同步（避免与内部编辑互斥，仅在差异大时 setContent）
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (sanitizeRichHtml(value) !== current) {
      editor.commands.setContent(sanitizeRichHtml(value) || '');
    }
  }, [value, editor]);

  // disabled 切换
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  // 全屏切换
  useEffect(() => {
    if (!wrapRef.current) return;
    if (isFullscreen) {
      wrapRef.current.requestFullscreen?.().catch(() => undefined);
    } else if (document.fullscreenElement) {
      void document.exitFullscreen();
    }
  }, [isFullscreen]);

  // 图片上传：走 /api/upload（files 目录），成功插入光标处
  const insertImage = async (file: File): Promise<void> => {
    if (!editor) return;
    try {
      const { url } = await uploadFileApi(file, 'files');
      editor.chain().focus().setImage({ src: url }).run();
    } catch {
      void message.error('图片上传失败');
    }
  };

  const onPickImage = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void insertImage(file);
    };
    input.click();
  };

  // 表格快捷操作
  const tableOps = useMemo(
    () => ({
      insertTable: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      addRowAfter: () => editor?.chain().focus().addRowAfter().run(),
      deleteRow: () => editor?.chain().focus().deleteRow().run(),
      addColumnAfter: () => editor?.chain().focus().addColumnAfter().run(),
      deleteColumn: () => editor?.chain().focus().deleteColumn().run(),
      deleteTable: () => editor?.chain().focus().deleteTable().run(),
    }),
    [editor],
  );

  return (
    <div
      ref={wrapRef}
      className="rich-editor"
      style={{
        border: `1px solid ${isDark ? '#3a3a3f' : '#d9d9d9'}`,
        borderRadius: 6,
        overflow: 'hidden',
        background: isDark ? '#1f1f23' : '#fff',
        transition: 'border-color 0.2s',
      }}
    >
      {/* 工具栏 */}
      {editor && (
        <div
          className="rich-editor__toolbar"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 2,
            padding: '4px 6px',
            borderBottom: `1px solid ${isDark ? '#3a3a3f' : '#f0f0f0'}`,
            background: isDark ? '#26262b' : '#fafafa',
          }}
        >
          <ToolbarButton label="撤销" icon={<UndoOutlined />} onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} />
          <ToolbarButton label="重做" icon={<RedoOutlined />} onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} />
          <Divider orientation="vertical" />
          <ToolbarButton label="加粗" icon={<BoldOutlined />} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
          <ToolbarButton label="斜体" icon={<ItalicOutlined />} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
          <ToolbarButton label="下划线" icon={<UnderlineOutlined />} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <ToolbarButton label="删除线" icon={<StrikethroughOutlined />} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
          <ToolbarButton label="清除格式" icon={<DeleteOutlined />} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} />
          <Divider orientation="vertical" />
          <ToolbarButton label="标题1" icon={<span style={{ fontSize: 11, fontWeight: 700 }}>H1</span>} active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
          <ToolbarButton label="标题2" icon={<span style={{ fontSize: 11, fontWeight: 700 }}>H2</span>} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
          <ToolbarButton label="标题3" icon={<span style={{ fontSize: 11, fontWeight: 700 }}>H3</span>} active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
          <ToolbarButton label="正文" icon={<span style={{ fontSize: 11 }}>P</span>} active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()} />
          <Divider orientation="vertical" />
          <ToolbarButton label="无序列表" icon={<UnorderedListOutlined />} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolbarButton label="有序列表" icon={<OrderedListOutlined />} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <ToolbarButton label="引用" icon={<EditOutlined />} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
          <ToolbarButton label="代码块" icon={<CodeOutlined />} active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
          <Divider orientation="vertical" />
          <ToolbarButton label="左对齐" icon={<AlignLeftOutlined />} active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
          <ToolbarButton label="居中" icon={<AlignCenterOutlined />} active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
          <ToolbarButton label="右对齐" icon={<AlignRightOutlined />} active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
          <Divider orientation="vertical" />
          <ToolbarButton label="插入链接" icon={<LinkOutlined />} active={editor.isActive('link')} onClick={() => {
            const prev = editor.getAttributes('link').href as string | undefined;
            const url = window.prompt('链接地址', prev ?? 'https://');
            if (url === null) return;
            if (url === '') {
              editor.chain().focus().unsetLink().run();
              return;
            }
            editor.chain().focus().setLink({ href: url }).run();
          }} />
          <ToolbarButton label="插入图片" icon={<PictureOutlined />} onClick={onPickImage} />
          <ToolbarButton label="插入表格" icon={<TableOutlined />} onClick={() => tableOps.insertTable()} />
          <ToolbarButton label="表格上方插入行" icon={<InsertRowAboveOutlined />} onClick={() => tableOps.addRowAfter()} />
          <ToolbarButton label="删除行" icon={<DeleteRowOutlined />} onClick={() => tableOps.deleteRow()} />
          <ToolbarButton label="表格右插入列" icon={<InsertRowBelowOutlined />} onClick={() => tableOps.addColumnAfter()} />
          <ToolbarButton label="删除列" icon={<DeleteColumnOutlined />} onClick={() => tableOps.deleteColumn()} />
          <ToolbarButton label="删除表格" icon={<BorderOuterOutlined />} onClick={() => tableOps.deleteTable()} />
          <ToolbarButton label="列宽自适应" icon={<ColumnWidthOutlined />} onClick={() => editor.chain().focus().setCellAttribute('colspan', 1).run()} />
          <Divider orientation="vertical" />
          <ToolbarButton
            label={isFullscreen ? '退出全屏' : '全屏'}
            icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={() => setIsFullscreen((v) => !v)}
          />
        </div>
      )}

      {/* 编辑区 */}
      <div
        className="rich-editor__content"
        style={{
          minHeight: minHeight,
          padding: '8px 12px',
          fontSize: 14,
          lineHeight: 1.75,
          color: isDark ? '#d9d9d9' : '#333',
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Tiptap 内容区样式（无全局 CSS 依赖） */}
      <style>{`
        .rich-editor .ProseMirror { outline: none; min-height: ${minHeight}px; }
        .rich-editor .ProseMirror p { margin: 0.5em 0; }
        .rich-editor .ProseMirror h1 { font-size: 1.6em; margin: 0.6em 0 0.3em; }
        .rich-editor .ProseMirror h2 { font-size: 1.35em; margin: 0.6em 0 0.3em; }
        .rich-editor .ProseMirror h3 { font-size: 1.15em; margin: 0.6em 0 0.3em; }
        .rich-editor .ProseMirror ul, .rich-editor .ProseMirror ol { padding-left: 1.5em; }
        .rich-editor .ProseMirror blockquote {
          border-left: 3px solid ${isDark ? '#555' : '#d9d9d9'};
          padding-left: 12px; margin: 0.5em 0; color: ${isDark ? '#aaa' : '#666'};
        }
        .rich-editor .ProseMirror pre {
          background: ${isDark ? '#2d2d33' : '#f5f5f5'};
          padding: 10px 12px; border-radius: 4px; overflow-x: auto;
          font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px;
        }
        .rich-editor .ProseMirror code {
          background: ${isDark ? '#2d2d33' : '#f5f5f5'};
          padding: 1px 5px; border-radius: 3px;
          font-family: 'SFMono-Regular', Consolas, monospace;
        }
        .rich-editor .ProseMirror pre code { background: none; padding: 0; }
        .rich-editor .ProseMirror a { color: #1677ff; text-decoration: underline; }
        .rich-editor .ProseMirror img {
          max-width: 100%; height: auto; border-radius: 4px;
        }
        .rich-editor .ProseMirror table {
          border-collapse: collapse; margin: 0.5em 0; width: 100%;
        }
        .rich-editor .ProseMirror th, .rich-editor .ProseMirror td {
          border: 1px solid ${isDark ? '#555' : '#d9d9d9'};
          padding: 4px 10px; min-width: 40px;
        }
        .rich-editor .ProseMirror th { background: ${isDark ? '#2d2d33' : '#fafafa'}; font-weight: 600; }
        .rich-editor .ProseMirror .selectedCell::after {
          content: ''; position: absolute; inset: 0; z-index: 2;
          background: rgba(22, 119, 255, 0.12); pointer-events: none;
        }
        .rich-editor .ProseMirror .selectedCell { position: relative; }
        .rich-editor .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder); float: left; color: ${isDark ? '#666' : '#bbb'};
          pointer-events: none; height: 0;
        }
      `}</style>
    </div>
  );
}
