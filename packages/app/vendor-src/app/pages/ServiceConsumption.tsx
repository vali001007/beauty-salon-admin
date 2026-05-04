import React, { useState } from 'react';
import { Edit, ChevronDown, ChevronRight, Plus, AlertTriangle, Calendar } from 'lucide-react';
import { Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Input } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

interface Service {
  id: number;
  name: string;
  duration: number;
  price: number;
  bomCount: number;
  bom: BOMItem[];
}

interface BOMItem {
  id: number;
  productName: string;
  sku: string;
  standardQty: number;
  unit: string;
}

interface ConsumptionRecord {
  id: number;
  date: string;
  serviceName: string;
  customerName: string;
  beautician: string;
  storeName: string;
  productName: string;
  standardQty: number;
  actualQty: number;
  deviation: number;
  isAbnormal: boolean;
}

interface ForecastItem {
  productName: string;
  sku: string;
  forecastConsumption: number;
  currentStock: number;
  shortage: number;
}

const MOCK_SERVICES: Service[] = [
  {
    id: 1,
    name: '深层补水护理',
    duration: 90,
    price: 680,
    bomCount: 4,
    bom: [
      { id: 1, productName: '玻尿酸精华液', sku: 'SK-LO-000001', standardQty: 3, unit: 'ml' },
      { id: 2, productName: '补水面膜', sku: 'SK-LO-000002', standardQty: 1, unit: '片' },
      { id: 3, productName: '保湿乳液', sku: 'SK-LO-000007', standardQty: 5, unit: 'ml' },
      { id: 4, productName: '按摩精油', sku: 'SK-LO-000008', standardQty: 2, unit: 'ml' },
    ],
  },
  {
    id: 2,
    name: '美白焕肤疗程',
    duration: 120,
    price: 1280,
    bomCount: 5,
    bom: [
      { id: 1, productName: '美白精华', sku: 'SK-LO-000003', standardQty: 4, unit: 'ml' },
      { id: 2, productName: '焕肤面膜', sku: 'SK-LO-000009', standardQty: 1, unit: '片' },
      { id: 3, productName: '修护精华', sku: 'SK-LO-000010', standardQty: 3, unit: 'ml' },
    ],
  },
  {
    id: 3,
    name: '头皮护理SPA',
    duration: 60,
    price: 380,
    bomCount: 3,
    bom: [
      { id: 1, productName: '修护洗发水', sku: 'SK-LO-000004', standardQty: 15, unit: 'ml' },
      { id: 2, productName: '头皮精华', sku: 'SK-LO-000011', standardQty: 5, unit: 'ml' },
    ],
  },
];

const MOCK_CONSUMPTION: ConsumptionRecord[] = [
  { id: 1, date: '2026-03-25', serviceName: '深层补水护理', customerName: '张女士', beautician: '李美容师', storeName: '心悦美容养生会所', productName: '玻尿酸精华液', standardQty: 3, actualQty: 5, deviation: 66.7, isAbnormal: true },
  { id: 2, date: '2026-03-25', serviceName: '美白焕肤疗程', customerName: '王女士', beautician: '陈美容师', storeName: '凤仪阁美容养生会所', productName: '美白精华', standardQty: 4, actualQty: 4, deviation: 0, isAbnormal: false },
  { id: 3, date: '2026-03-24', serviceName: '深层补水护理', customerName: '赵女士', beautician: '刘美容师', storeName: '心悦美容养生会所', productName: '补水面膜', standardQty: 1, actualQty: 1, deviation: 0, isAbnormal: false },
  { id: 4, date: '2026-03-24', serviceName: '头皮护理SPA', customerName: '李女士', beautician: '张美容师', storeName: '凤仪阁美容养生会所', productName: '修护洗发水', standardQty: 15, actualQty: 22, deviation: 46.7, isAbnormal: true },
];

const MOCK_FORECAST: ForecastItem[] = [
  { productName: '玻尿酸精华液', sku: 'SK-LO-000001', forecastConsumption: 45, currentStock: 70, shortage: 0 },
  { productName: '补水面膜', sku: 'SK-LO-000002', forecastConsumption: 28, currentStock: 13, shortage: 15 },
  { productName: '美白精华', sku: 'SK-LO-000003', forecastConsumption: 32, currentStock: 3, shortage: 29 },
  { productName: '修护洗发水', sku: 'SK-LO-000004', forecastConsumption: 180, currentStock: 270, shortage: 0 },
];

export function ServiceConsumption() {
  const [activeTab, setActiveTab] = useState<'bom' | 'consumption' | 'forecast'>('bom');
  const [expandedServices, setExpandedServices] = useState<number[]>([1]);
  const [showEditBOMDialog, setShowEditBOMDialog] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [filterAbnormal, setFilterAbnormal] = useState(false);

  const toggleService = (serviceId: number) => {
    setExpandedServices(prev =>
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const handleEditBOM = (service: Service) => {
    setSelectedService(service);
    setShowEditBOMDialog(true);
  };

  const filteredConsumption = filterAbnormal
    ? MOCK_CONSUMPTION.filter(r => r.isAbnormal)
    : MOCK_CONSUMPTION;

  const totalAppointments = 38;

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        首页 / 库存管理 / 服务消耗与BOM
      </div>

      <h2 className="text-xl font-semibold text-gray-800">服务消耗与BOM</h2>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('bom')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'bom'
              ? 'text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          BOM管理
          {activeTab === 'bom' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('consumption')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'consumption'
              ? 'text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          消耗记录
          {activeTab === 'consumption' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('forecast')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'forecast'
              ? 'text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          库存预估
          {activeTab === 'forecast' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
      </div>

      {/* BOM Management Tab */}
      {activeTab === 'bom' && (
        <div className="space-y-3">
          {MOCK_SERVICES.map((service) => (
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
                  onClick={(e) => {
                    e.stopPropagation();
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
          ))}
        </div>
      )}

      {/* Consumption Records Tab */}
      {activeTab === 'consumption' && (
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
                onChange={(e) => setFilterAbnormal(e.target.checked)}
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
        </>
      )}

      {/* Forecast Tab */}
      {activeTab === 'forecast' && (
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
              {MOCK_FORECAST.map((item, index) => (
                <TableRow key={index} className={`hover:bg-blue-50/30 ${item.shortage > 0 ? 'bg-orange-50' : ''}`}>
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
        </>
      )}

      {/* Edit BOM Dialog */}
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
                  {selectedService.bom.map((item, index) => (
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
            <Button>保存修改</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}