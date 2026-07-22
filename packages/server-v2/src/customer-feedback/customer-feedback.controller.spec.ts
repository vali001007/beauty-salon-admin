import { CustomerFeedbackController } from './customer-feedback.controller.js';

describe('CustomerFeedbackController', () => {
  it('passes the authenticated store and user scope to create and update operations', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1, status: 'resolved' }),
    };
    const controller = new CustomerFeedbackController(service as never);

    await expect(controller.create('6', 9, { feedbackType: 'complaint' })).resolves.toEqual({ id: 1 });
    await expect(controller.update('6', 1, 9, { status: 'resolved' })).resolves.toEqual({ id: 1, status: 'resolved' });
    expect(service.create).toHaveBeenCalledWith(6, 9, { feedbackType: 'complaint' });
    expect(service.update).toHaveBeenCalledWith(6, 1, 9, { status: 'resolved' });
  });
});
