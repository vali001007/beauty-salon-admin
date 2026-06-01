// 全局变量
let currentPage = 'home-page';
let selectedService = null;
let selectedDate = null;
let selectedTime = null;
let selectedBeautician = null;

// 服务价格配置
const servicePrices = {
    'facial': 128,
    'massage': 158,
    'beauty': 198,
    'nail': 88
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
});

// 初始化应用
function initializeApp() {
    console.log('美容院预约小程序已启动');
    setMinDate();
}

// 设置最小日期（明天开始）
function setMinDate() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dateInput = document.getElementById('appointment-date');
    if (dateInput) {
        dateInput.min = tomorrow.toISOString().split('T')[0];
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 服务选择
    const serviceOptions = document.querySelectorAll('.service-option');
    serviceOptions.forEach(option => {
        option.addEventListener('click', function() {
            selectService(this.dataset.service);
        });
    });
    
    // 时间选择
    const timeSlots = document.querySelectorAll('.time-slot');
    timeSlots.forEach(slot => {
        slot.addEventListener('click', function() {
            selectTime(this.dataset.time);
        });
    });
    
    // 美容师选择
    const beauticianCards = document.querySelectorAll('.beautician-card');
    beauticianCards.forEach(card => {
        card.addEventListener('click', function() {
            selectBeautician(this.dataset.beautician);
        });
    });
    
    // 日期选择
    const dateInput = document.getElementById('appointment-date');
    if (dateInput) {
        dateInput.addEventListener('change', function() {
            selectDate(this.value);
        });
    }
    
    // 课堂分类切换
    const categoryTabs = document.querySelectorAll('.category-tab');
    categoryTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            switchCourseCategory(this.dataset.category);
        });
    });
    
    // 订单状态切换
    const orderTabs = document.querySelectorAll('.order-tab');
    orderTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            switchOrderStatus(this.dataset.status);
        });
    });
    
    // 聊天输入框回车键
    const userInput = document.getElementById('user-input');
    if (userInput) {
        userInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
}

// 页面切换函数
function showPage(pageId) {
    // 隐藏所有页面
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.classList.remove('active');
    });
    
    // 显示目标页面
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
        currentPage = pageId;
        updateBottomNav(pageId);
    }
}

// 更新底部导航状态
function updateBottomNav(pageId) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
    });
    
    let targetNav = null;
    switch(pageId) {
        case 'home-page':
            targetNav = document.querySelector('.nav-item:nth-child(1)');
            break;
        case 'booking-page':
            targetNav = document.querySelector('.nav-item:nth-child(2)');
            break;
        case 'orders-page':
            targetNav = document.querySelector('.nav-item:nth-child(3)');
            break;
        case 'profile-page':
            targetNav = document.querySelector('.nav-item:nth-child(4)');
            break;
    }
    
    if (targetNav) {
        targetNav.classList.add('active');
    }
}

// 服务选择
function selectService(serviceType) {
    document.querySelectorAll('.service-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    const selectedOption = document.querySelector(`[data-service="${serviceType}"]`);
    if (selectedOption) {
        selectedOption.classList.add('selected');
    }
    
    selectedService = serviceType;
    updateBookingSummary();
}

// 日期选择
function selectDate(date) {
    selectedDate = date;
    updateBookingSummary();
}

// 时间选择
function selectTime(time) {
    document.querySelectorAll('.time-slot').forEach(slot => {
        slot.classList.remove('selected');
    });
    
    const selectedSlot = document.querySelector(`[data-time="${time}"]`);
    if (selectedSlot) {
        selectedSlot.classList.add('selected');
    }
    
    selectedTime = time;
    updateBookingSummary();
}

// 美容师选择
function selectBeautician(beauticianId) {
    document.querySelectorAll('.beautician-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    const selectedCard = document.querySelector(`[data-beautician="${beauticianId}"]`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }
    
    selectedBeautician = beauticianId;
    updateBookingSummary();
}

// 更新预约摘要
function updateBookingSummary() {
    const serviceElement = document.getElementById('selected-service');
    const dateElement = document.getElementById('selected-date');
    const timeElement = document.getElementById('selected-time');
    const beauticianElement = document.getElementById('selected-beautician');
    const priceElement = document.getElementById('total-price');
    
    if (serviceElement) {
        serviceElement.textContent = selectedService ? getServiceName(selectedService) : '请选择服务';
    }
    
    if (dateElement) {
        dateElement.textContent = selectedDate ? formatDate(selectedDate) : '请选择日期';
    }
    
    if (timeElement) {
        timeElement.textContent = selectedTime || '请选择时间';
    }
    
    if (beauticianElement) {
        beauticianElement.textContent = selectedBeautician ? getBeauticianName(selectedBeautician) : '请选择美容师';
    }
    
    if (priceElement) {
        const price = selectedService ? servicePrices[selectedService] : 0;
        priceElement.textContent = `¥${price}`;
    }
}

// 获取服务名称
function getServiceName(serviceType) {
    const serviceNames = {
        'facial': '面部护理',
        'massage': '身体按摩',
        'beauty': '美体塑形',
        'nail': '美甲服务'
    };
    return serviceNames[serviceType] || serviceType;
}

// 获取美容师姓名
function getBeauticianName(beauticianId) {
    const beauticianNames = {
        'anna': '安娜',
        'sarah': '莎拉'
    };
    return beauticianNames[beauticianId] || beauticianId;
}

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}年${month}月${day}日`;
}

// 确认预约
function confirmBooking() {
    if (!selectedService || !selectedDate || !selectedTime || !selectedBeautician) {
        showToast('请完善所有预约信息');
        return;
    }
    
    showToast('预约成功！');
    resetBookingSelection();
    
    setTimeout(() => {
        showPage('orders-page');
    }, 1500);
}

// 重置预约选择
function resetBookingSelection() {
    selectedService = null;
    selectedDate = null;
    selectedTime = null;
    selectedBeautician = null;
    
    document.querySelectorAll('.service-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    document.querySelectorAll('.time-slot').forEach(slot => {
        slot.classList.remove('selected');
    });
    
    document.querySelectorAll('.beautician-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    const dateInput = document.getElementById('appointment-date');
    if (dateInput) {
        dateInput.value = '';
    }
    
    updateBookingSummary();
}

// 切换课程分类
function switchCourseCategory(category) {
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const activeTab = document.querySelector(`[data-category="${category}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    document.querySelectorAll('.course-category').forEach(cat => {
        cat.classList.remove('active');
    });
    
    const targetCategory = document.getElementById(category);
    if (targetCategory) {
        targetCategory.classList.add('active');
    }
}

// 切换订单状态
function switchOrderStatus(status) {
    document.querySelectorAll('.order-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const activeTab = document.querySelector(`[data-status="${status}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // 这里可以添加订单过滤逻辑
    showToast(`切换到${getStatusText(status)}订单`);
}

// 获取状态文本
function getStatusText(status) {
    const statusTexts = {
        'all': '全部',
        'pending': '待确认',
        'confirmed': '已确认',
        'completed': '已完成',
        'cancelled': '已取消'
    };
    return statusTexts[status] || status;
}

// AI助手功能
function askQuestion(question) {
    addUserMessage(question);
    
    setTimeout(() => {
        const aiResponse = getAIResponse(question);
        addAIMessage(aiResponse);
    }, 1000);
}

// 发送消息
function sendMessage() {
    const userInput = document.getElementById('user-input');
    if (!userInput || !userInput.value.trim()) return;
    
    const message = userInput.value.trim();
    addUserMessage(message);
    userInput.value = '';
    
    setTimeout(() => {
        const aiResponse = getAIResponse(message);
        addAIMessage(aiResponse);
    }, 1000);
}

// 添加用户消息
function addUserMessage(message) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message';
    messageDiv.innerHTML = `
        <div class="message-content">
            <p>${message}</p>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 添加AI消息
function addAIMessage(message) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai-message';
    messageDiv.innerHTML = `
        <div class="message-content">
            <p>${message}</p>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 获取AI回复
function getAIResponse(question) {
    const responses = {
        '皮肤干燥护理': '对于干燥皮肤，建议：1. 使用温和的洁面产品 2. 选择含有玻尿酸、神经酰胺的保湿产品 3. 每周使用2-3次补水面膜 4. 避免过度清洁和热水洗脸 5. 保持室内湿度',
        '护肤品选择': '选择护肤品时要注意：1. 了解自己的皮肤类型 2. 查看成分表，避免刺激性成分 3. 从基础护理开始，逐步添加功能性产品 4. 注意产品的保质期和储存条件 5. 可以先试用小样',
        '痘痘肌护理': '痘痘肌护理要点：1. 温和清洁，避免过度去油 2. 使用含有水杨酸、果酸的产品 3. 避免用手挤压痘痘 4. 保持饮食清淡，多喝水 5. 定期去角质，但不要过度',
        '美白产品推荐': '推荐的美白成分：1. 维生素C及其衍生物 2. 烟酰胺（维生素B3）3. 熊果苷 4. 曲酸 5. 传明酸。建议：白天使用防晒，晚上使用美白产品，坚持使用才能看到效果'
    };
    
    for (const [key, value] of Object.entries(responses)) {
        if (question.includes(key) || key.includes(question)) {
            return value;
        }
    }
    
    return '感谢您的咨询！我是您的专属AI美容助手，可以为您提供专业的美容建议。如果您有具体的美容问题，请详细描述，我会为您提供个性化的解决方案。';
}

// 个人中心功能
function editProfile() {
    showToast('编辑资料功能开发中...');
}

function showOrders(status) {
    showToast(`查看${getOrderStatusText(status)}订单`);
    // 这里可以跳转到订单页面或显示对应状态的订单
}

function showAppointments(status) {
    showToast(`查看${getAppointmentStatusText(status)}预约`);
    // 这里可以跳转到预约页面或显示对应状态的预约
}

function showBenefits() {
    showToast('我的权益功能开发中...');
}

function showCart() {
    showToast('购物车功能开发中...');
}

function showCoupons() {
    showToast('优惠券功能开发中...');
}

function showPoints() {
    showToast('积分功能开发中...');
}

function showCustomerService() {
    showToast('客服功能开发中...');
}

function showSettings() {
    showToast('设置功能开发中...');
}

// 获取订单状态文本
function getOrderStatusText(status) {
    const statusTexts = {
        'pending-payment': '待付款',
        'pending-consumption': '待消费',
        'pending-shipment': '待发货',
        'pending-receipt': '待收货',
        'pending-review': '待评价'
    };
    return statusTexts[status] || status;
}

// 获取预约状态文本
function getAppointmentStatusText(status) {
    const statusTexts = {
        'pending-service': '待服务',
        'completed': '已完成',
        'pending-payment': '待付款'
    };
    return statusTexts[status] || status;
}

// 显示提示消息
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 12px 24px;
        border-radius: 25px;
        font-size: 14px;
        z-index: 10000;
        animation: slideDown 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
`;
document.head.appendChild(style); 