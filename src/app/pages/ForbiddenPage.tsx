import React from 'react';
import { ArrowLeft, LayoutDashboard, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '../components/UI';

export const ForbiddenPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background px-4">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div className="mb-2 text-sm font-medium text-muted-foreground">403 / 权限受限</div>
        <h1 className="text-2xl font-semibold text-foreground">当前账号暂不能访问此功能</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          该页面可能需要店长、系统管理员或对应门店的数据权限。你可以返回上一页继续处理业务，或回到工作台查看可用任务。
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button variant="outline" className="gap-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            返回上一页
          </Button>
          <Button className="gap-2" onClick={() => navigate('/dashboard')}>
            <LayoutDashboard className="h-4 w-4" />
            回到工作台
          </Button>
        </div>
      </div>
    </div>
  );
};
