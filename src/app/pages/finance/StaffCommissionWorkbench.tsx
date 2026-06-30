import { useState } from 'react';
import { BarChart3, Settings, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { usePermission } from '@/hooks/usePermission';
import { BeauticianPerformance } from '../operation-profit/BeauticianPerformance';
import { CommissionRecords } from './CommissionRecords';
import { CommissionRules } from './CommissionRules';

type StaffCommissionTab = 'records' | 'rules' | 'performance';

export function StaffCommissionWorkbench() {
  const [tab, setTab] = useState<StaffCommissionTab>('performance');
  const canManageFinance = usePermission('core:finance:manage');

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-xl font-semibold text-foreground">员工提成</h1>
        <p className="mt-1 text-sm text-muted-foreground">系统自动计算提成流水，管理人员只需维护规则并在流水中处理必要调整。</p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as StaffCommissionTab)} className="gap-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="performance" className="gap-2">
            <Users className="h-4 w-4" />
            员工人效
          </TabsTrigger>
          <TabsTrigger value="records" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            提成流水
          </TabsTrigger>
          {canManageFinance ? (
            <TabsTrigger value="rules" className="gap-2">
              <Settings className="h-4 w-4" />
              提成规则
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="performance">{tab === 'performance' ? <BeauticianPerformance /> : null}</TabsContent>
        <TabsContent value="records">{tab === 'records' ? <CommissionRecords /> : null}</TabsContent>
        {canManageFinance ? <TabsContent value="rules">{tab === 'rules' ? <CommissionRules /> : null}</TabsContent> : null}
      </Tabs>
    </div>
  );
}
