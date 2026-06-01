import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, ChevronDown, ChevronRight, Edit, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { getBomConsumptionRecords, getBomForecast, getBomList } from '@/api/bom';
import type { ConsumptionRecord, ForecastItem, Service } from '@/types/bom';

export function ServiceConsumption() {
  const [activeTab, setActiveTab] = useState<'bom' | 'consumption' | 'forecast'>('bom');
  const [services, setServices] = useState<Service[]>([]);
  const [consumption, setConsumption] = useState<ConsumptionRecord[]>([]);
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedServices, setExpandedServices] = useState<number[]>([]);
  const [showEditBOMDialog, setShowEditBOMDialog] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [filterAbnormal, setFilterAbnormal] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [serviceData, consumptionData, forecastData] = await Promise.all([
        getBomList(),
        getBomConsumptionRecords(),
        getBomForecast(),
      ]);
      setServices(serviceData);
      setConsumption(consumptionData);
      setForecast(forecastData);
      setExpandedServices((current) => current.length > 0 ? current : serviceData.slice(0, 1).map((item) => item.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : '服务消耗数据加载失败';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleService = (serviceId: number) => {
    setExpandedServices((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId],
    );
  };

  const handleEditBOM = (service: Service) => {
    setSelectedService(service);
    setShowEditBOMDialog(true);
  };

  const filteredConsumption = useMemo(
    () => filterAbnormal ? consumption.filter((record) => record.isAbnormal) : consumption,
    [consumption, filterAbnormal],
  );

  const totalAppointments = Math.max(38, Math.round(consumption.length * 8.5));

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">
        首页 / 库存管理 / 服务消耗与BOM
      </div>

      <h2 className="text-xl font-semibold text-gray-800">服务消耗与BOM</h2>

      <div className="flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('bom')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'bom' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-800'
          }`}
          type="button"
        >
          BOM管理
          {activeTab === 'bom' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button
          onClick={() => setActiveTab('consumption')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'consumption' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-800'
          }`}
          type="button"
        >
          消耗记录
          {activeTab === 'consumption' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button
          onClick={() => setActiveTab('forecast')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'forecast' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-800'
          }`}
          type="button"
        >
          库存预估
          {activeTab === 'forecast' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
      </div>

      {loading && <div className="py-10 text-center text-sm text-gray-500">正在加载服务消耗数据...</div>}

      {!loading && activeTab === 'bom' && (
        <div className="space-y-3">
          {services.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">暂无 BOM 数据</div>
          ) : (
            services.map((service) => (
              <div key={service.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer" onClick={() => toggleService(service.id)}>
                  <div className="flex items-center gap-3 flex-1">
                    {expandedServices.includes(service.id) ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-800">{service.name}</h3>
                        <span className="text-sm text-gray-500">{service.duration}分钟</span>
                        <span className="text-sm font-medium text-blue-600">¥{service.price}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">BOM产品数: {service.bomCount}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleEditBOM(service);
                    }}
                  >
                    <Edit className="w-3 h-3" /> 编辑BOM
                  </Button>
                </div>

                {expandedServices.includes(service.id) && (
                  <div className="border-t border-gray-200 bg-gray-50 p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">BOM明细</h4>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-white">
                          <TableHead>产品名称</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>标准用量</TableHead>
                          <TableHead>单位</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {service.bom.map((item) => (
                          <TableRow key={item.id} className="bg-white">
                            <TableCell className="font-medium text-gray-800">{item.productName}</TableCell>
                            <TableCell className="font-mono text-sm text-gray-600">{item.sku}</TableCell>
                            <TableCell className="font-medium text-blue-600">{item.standardQty}</TableCell>
                            <TableCell className="text-gray-600">{item.unit}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {!loading && activeTab === 'consumption' && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Input type="date" className="w-40" />
              <span className="text-gray-400">至</span>
              <Input type="date" className="w-40" />
              <select className="h-9 px-3 text-sm border border-gray-300 rounded-md">
                <option>全部门店</option>
                <option>心悦美容养生会所</option>
                <option>凤仪阁美容养生会所</option>
              </select>
              <select className="h-9 px-3 text-sm border border-gray-300 rounded-md">
                <option>全部美容师</option>
                <option>李美容师</option>
                <option>陈美容师</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="abnormal"
                className="w-4 h-4"
                checked={filterAbnormal}
                onChange={(event) => setFilterAbnormal(event.target.checked)}
              />
              <label htmlFor="abnormal" className="text-sm text-gray-700">仅显示异常</label>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead>日期</TableHead>
                <TableHead>服务项目</TableHead>
                <TableHead>客户</TableHead>
                <TableHead>美容师</TableHead>
                <TableHead>门店</TableHead>
                <TableHead>产品</TableHead>
                <TableHead>标准用量</TableHead>
                <TableHead>实际用量</TableHead>
                <TableHead>偏差%</TableHead>
                <TableHead>异常</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredConsumption.map((record) => (
                <TableRow key={record.id} className={`hover:bg-blue-50/30 ${record.deviation > 20 ? 'bg-red-50' : ''}`}>
                  <TableCell>{record.date}</TableCell>
                  <TableCell className="font-medium text-gray-800">{record.serviceName}</TableCell>
                  <TableCell>{record.customerName}</TableCell>
                  <TableCell>{record.beautician}</TableCell>
                  <TableCell className="text-sm text-gray-600">{record.storeName}</TableCell>
                  <TableCell>{record.productName}</TableCell>
                  <TableCell className="text-gray-600">{record.standardQty}</TableCell>
                  <TableCell className="font-medium">{record.actualQty}</TableCell>
                  <TableCell>
                    <span className={`font-semibold ${record.deviation > 20 ? 'text-red-600' : 'text-gray-700'}`}>
                      {record.deviation > 0 ? '+' : ''}{record.deviation.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell>
                    {record.isAbnormal && (
                      <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700">
                        异常
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredConsumption.length === 0 && <div className="py-10 text-center text-sm text-gray-500">暂无消耗记录</div>}
        </>
      )}

      {!loading && activeTab === 'forecast' && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
            <Calendar className="w-5 h-5 text-blue-600" />
            <p className="text-sm text-blue-700">
              <strong>基于未来7天共 {totalAppointments} 个预约计算</strong>
            </p>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead>产品名称</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>预计消耗</TableHead>
                <TableHead>当前库存</TableHead>
                <TableHead>缺口量</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forecast.map((item) => (
                <TableRow key={item.sku} className={`hover:bg-blue-50/30 ${item.shortage > 0 ? 'bg-orange-50' : ''}`}>
                  <TableCell className="font-medium text-gray-800">{item.productName}</TableCell>
                  <TableCell className="font-mono text-sm text-gray-600">{item.sku}</TableCell>
                  <TableCell className="font-medium text-blue-600">{item.forecastConsumption}</TableCell>
                  <TableCell className={item.shortage > 0 ? 'text-orange-600 font-medium' : ''}>
                    {item.currentStock}
                  </TableCell>
                  <TableCell>
                    {item.shortage > 0 ? (
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <span className="font-semibold text-red-600">{item.shortage}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.shortage > 0 && (
                      <Button size="sm" variant="outline" className="text-blue-600">
                        补货建议
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {forecast.length === 0 && <div className="py-10 text-center text-sm text-gray-500">暂无库存预估</div>}
        </>
      )}

      <Dialog open={showEditBOMDialog} onOpenChange={setShowEditBOMDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby="edit-bom-description">
          <DialogHeader>
            <DialogTitle>编辑BOM - {selectedService?.name}</DialogTitle>
          </DialogHeader>
          <span id="edit-bom-description" className="sr-only">编辑服务项目的物料清单</span>

          {selectedService && (
            <div className="space-y-4 mt-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-gray-600">服务时长</div>
                    <div className="font-medium text-gray-800 mt-1">{selectedService.duration}分钟</div>
                  </div>
                  <div>
                    <div className="text-gray-600">服务价格</div>
                    <div className="font-medium text-gray-800 mt-1">¥{selectedService.price}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">BOM产品数</div>
                    <div className="font-medium text-gray-800 mt-1">{selectedService.bomCount}</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-800">产品明细</h4>
                  <Button size="sm" variant="outline" className="gap-2">
                    <Plus className="w-3 h-3" /> 添加产品
                  </Button>
                </div>

                <div className="space-y-2">
                  {selectedService.bom.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 grid grid-cols-3 gap-3">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">产品名称</div>
                          <div className="text-sm font-medium text-gray-800">{item.productName}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">SKU</div>
                          <div className="text-sm font-mono text-gray-600">{item.sku}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">标准用量</div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              className="w-20 h-8 text-sm"
                              defaultValue={item.standardQty}
                            />
                            <span className="text-sm text-gray-600">{item.unit}</span>
                          </div>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50">
                        删除
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setShowEditBOMDialog(false)}>
              取消
            </Button>
            <Button onClick={() => toast.info('BOM 编辑接口将在后端联调阶段接入')}>保存修改</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
