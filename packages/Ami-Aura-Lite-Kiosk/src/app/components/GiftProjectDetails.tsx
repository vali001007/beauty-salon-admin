import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type GiftProjectRow = {
  rowId: string;
  project: string;
  isDraft: boolean;
};

function createGiftProjectRowId() {
  return `gift-project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueProjects(projects: string[]) {
  return Array.from(new Set(projects.filter(Boolean)));
}

export function GiftProjectDetails({
  projects,
  selectedProjects,
  onChange,
}: {
  projects: string[];
  selectedProjects: string[];
  onChange: (projects: string[]) => void;
}) {
  const [draftRows, setDraftRows] = useState<string[]>([]);

  useEffect(() => {
    const projectSet = new Set(projects);
    const nextProjects = selectedProjects.filter((project) => projectSet.has(project));
    if (nextProjects.length !== selectedProjects.length) {
      onChange(nextProjects);
    }
  }, [onChange, projects, selectedProjects]);

  const rows = useMemo<GiftProjectRow[]>(
    () => [
      ...selectedProjects.map((project) => ({
        rowId: `selected-${project}`,
        project,
        isDraft: false,
      })),
      ...draftRows.map((rowId) => ({
        rowId,
        project: "",
        isDraft: true,
      })),
    ],
    [draftRows, selectedProjects],
  );

  const hasAvailableProject = projects.length > selectedProjects.length + draftRows.length;

  const addRow = () => {
    if (!hasAvailableProject) return;
    setDraftRows((prev) => [...prev, createGiftProjectRowId()]);
  };

  const removeRow = (row: GiftProjectRow) => {
    if (row.isDraft) {
      setDraftRows((prev) => prev.filter((rowId) => rowId !== row.rowId));
      return;
    }
    onChange(selectedProjects.filter((project) => project !== row.project));
  };

  const selectProject = (row: GiftProjectRow, project: string) => {
    if (row.isDraft) {
      setDraftRows((prev) => prev.filter((rowId) => rowId !== row.rowId));
      if (project) {
        onChange(uniqueProjects([...selectedProjects, project]));
      }
      return;
    }

    if (!project) {
      onChange(selectedProjects.filter((item) => item !== row.project));
      return;
    }

    onChange(uniqueProjects(selectedProjects.map((item) => (item === row.project ? project : item))));
  };

  const renderOptions = (currentProject: string) => {
    const selectedSet = new Set(selectedProjects.filter((project) => project !== currentProject));
    return projects
      .filter((project) => project === currentProject || !selectedSet.has(project))
      .map((project) => (
        <option key={project} value={project}>
          {project}
        </option>
      ));
  };

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-[#6F6678]">赠送项目</div>
        </div>
        <button
          type="button"
          onClick={addRow}
          disabled={!hasAvailableProject}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2D1B69] px-4 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          添加明细
        </button>
      </div>

      {projects.length ? (
        rows.length ? (
          <div className="overflow-hidden rounded-2xl border border-black/5 bg-[#F7F5F2]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <thead className="bg-white/70 text-xs font-medium text-[#6F6678]">
                  <tr>
                    <th className="px-4 py-3">项目</th>
                    <th className="w-20 px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 bg-[#F7F5F2]">
                  {rows.map((row) => (
                    <tr key={row.rowId}>
                      <td className="px-4 py-3">
                        <select
                          value={row.project}
                          onChange={(event) => selectProject(row, event.target.value)}
                          className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-[#1F1B2D] outline-none focus:border-[#C9956C] focus:ring-2 focus:ring-[#C9956C]/20"
                        >
                          <option value="">请选择赠送项目</option>
                          {renderOptions(row.project)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => removeRow(row)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-rose-500 transition hover:bg-rose-50"
                          title="删除明细"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-black/5 px-4 py-3 text-sm">
              <span className="text-[#6F6678]">已选赠送项目</span>
              <span className="font-semibold text-[#1F1B2D]">{selectedProjects.length} 项</span>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-black/10 bg-[#F7F5F2] px-4 py-8 text-center text-sm text-[#6F6678]">
            暂无赠送明细。
          </div>
        )
      ) : (
        <div className="rounded-xl border border-dashed border-black/10 bg-[#F7F5F2] px-4 py-5 text-center text-sm text-[#6F6678]">
          管理端暂无已启用项目。
        </div>
      )}
    </div>
  );
}
