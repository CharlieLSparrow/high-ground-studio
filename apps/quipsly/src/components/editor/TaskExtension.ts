import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TaskNodeComponent } from './TaskNodeComponent';

export const TaskExtension = Node.create({
  name: 'taskNode',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      goalId: { default: null },
      projectId: { default: null },
      title: { default: 'New Task' }
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="task-node"]' }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'task-node' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskNodeComponent);
  }
});
