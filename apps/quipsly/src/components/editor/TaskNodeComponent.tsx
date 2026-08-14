import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useEffect, useState, useTransition } from 'react';
import { getGoalData, updateGoalStage } from '@/app/actions/kanban-actions';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

export const TaskNodeComponent = (props: NodeViewProps) => {
  const { goalId, projectId, title } = props.node.attrs;
  const [goalData, setGoalData] = useState<any>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!goalId || !projectId) return;
    let isMounted = true;
    
    const fetchGoal = async () => {
      try {
        const data = await getGoalData(projectId, goalId);
        if (isMounted && data) {
          setGoalData(data);
        }
      } catch (e) {
        console.error("Failed to fetch goal for TaskNode", e);
      }
    };

    fetchGoal();
    
    // Poll for changes to sync Kanban board updates back into the Chat stream
    const interval = setInterval(fetchGoal, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [goalId, projectId]);

  const handleStageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStageId = e.target.value;
    startTransition(async () => {
      const updated = await updateGoalStage(projectId, goalId, newStageId);
      if (updated) {
        setGoalData(updated);
      }
    });
  };

  const borderColor = goalData?.stage?.hexColor || '#e2e8f0';

  return (
    <NodeViewWrapper className="task-node-wrapper my-4">
      <div 
        className="flex items-center p-3 rounded-md border-l-4 border-t border-r border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm transition-colors"
        style={{ borderLeftColor: borderColor }}
        contentEditable={false}
      >
        <div className="flex-shrink-0 mr-3">
          {isPending ? (
            <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
          ) : goalData?.status === 'COMPLETE' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          ) : (
            <Circle className="w-5 h-5 text-zinc-400" />
          )}
        </div>
        <div className="flex-1 font-medium text-zinc-900 dark:text-zinc-100">
          {title}
        </div>
        
        {goalData?.stage && (
          <div className="ml-2 flex-shrink-0 relative">
            <select 
              value={goalData.stageId || ""}
              onChange={handleStageChange}
              disabled={isPending}
              className="appearance-none bg-transparent font-semibold text-xs px-3 py-1 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 transition-shadow"
              style={{ backgroundColor: `${borderColor}20`, color: borderColor }}
            >
              <option value={goalData.stageId}>{goalData.stage.name}</option>
              {/* In a real app we'd fetch all stages for the project, but for now we fallback to the current one and rely on Kanban Board for drag drops */}
            </select>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

