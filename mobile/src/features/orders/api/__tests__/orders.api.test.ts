/* eslint-disable max-lines-per-function */
import { ApiClient, axiosInstance } from '@/services/api/api-client';
import { OrdersApi } from '../orders.api';

describe('ordersApi.uploadImage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds FormData with correct file object for JPG and calls /uploads/image', async () => {
    let capturedUrl = '';
    let capturedBody: any = null;
    const appendSpy = jest.spyOn(FormData.prototype, 'append');

    jest.spyOn(ApiClient, 'post').mockImplementation(async (url: string, data?: any) => {
      capturedUrl = url;
      capturedBody = data;
      return {
        statusCode: 200,
        message: 'OK',
        data: { url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' },
      } as any;
    });

    const result = await OrdersApi.uploadImage('file:///path/to/test-photo.jpg', 'my_evidence');

    expect(result).toBe('https://res.cloudinary.com/demo/image/upload/sample.jpg');
    expect(capturedUrl).toBe('/uploads/image');
    expect(capturedBody).toBeInstanceOf(FormData);
    expect(capturedBody.get('file')).toBeTruthy();
    expect(appendSpy).toHaveBeenCalledWith('file', {
      uri: 'file:///path/to/test-photo.jpg',
      name: 'my_evidence.jpg',
      type: 'image/jpeg',
    });
  });

  it('handles PNG extensions with image/png MIME type', async () => {
    let capturedBody: any = null;
    const appendSpy = jest.spyOn(FormData.prototype, 'append');

    jest.spyOn(ApiClient, 'post').mockImplementation(async (_url: string, data?: any) => {
      capturedBody = data;
      return {
        statusCode: 200,
        message: 'OK',
        data: { url: 'https://res.cloudinary.com/demo/image/upload/sample.png' },
      } as any;
    });

    const result = await OrdersApi.uploadImage('file:///path/to/graphic.PNG', 'diagram');

    expect(result).toBe('https://res.cloudinary.com/demo/image/upload/sample.png');
    expect(capturedBody.get('file')).toBeTruthy();
    expect(appendSpy).toHaveBeenCalledWith('file', {
      uri: 'file:///path/to/graphic.PNG',
      name: 'diagram.png',
      type: 'image/png',
    });
  });

  it('integration with ApiClient: ensures default application/json is stripped so native boundary is used', async () => {
    let capturedConfig: any = null;

    axiosInstance.defaults.adapter = async (config: any) => {
      capturedConfig = config;
      return {
        data: {
          statusCode: 200,
          message: 'OK',
          data: { url: 'https://res.cloudinary.com/demo/image/upload/img.jpg' },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const url = await OrdersApi.uploadImage('file:///test.jpg', 'order_media');
    expect(url).toBe('https://res.cloudinary.com/demo/image/upload/img.jpg');
    expect(capturedConfig).toBeDefined();
    expect(capturedConfig.data).toBeInstanceOf(FormData);
    expect(capturedConfig.headers.getContentType()).toBe(false);
  });

  it('throws an error if response does not contain a url', async () => {
    jest.spyOn(ApiClient, 'post').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {} as any,
    });

    await expect(OrdersApi.uploadImage('file:///path/to/photo.jpg')).rejects.toThrow('Upload ảnh thất bại.');
  });

  it('forwards onUploadProgress and calculates percentage correctly', async () => {
    let capturedConfig: any = null;
    const progressSpy = jest.fn();

    jest.spyOn(ApiClient, 'post').mockImplementation(async (_url: string, _data?: any, config?: any) => {
      capturedConfig = config;
      // Simulate progress events
      config.onUploadProgress?.({ loaded: 25, total: 100 });
      config.onUploadProgress?.({ loaded: 50, total: 100 });
      config.onUploadProgress?.({ loaded: 100, total: 100 });
      return {
        statusCode: 200,
        message: 'OK',
        data: { url: 'https://res.cloudinary.com/demo/image/upload/photo.jpg' },
      } as any;
    });

    const url = await OrdersApi.uploadImage('file:///photo.jpg', 'booking_issue', {
      onProgress: progressSpy,
    });

    expect(url).toBe('https://res.cloudinary.com/demo/image/upload/photo.jpg');
    expect(capturedConfig?.onUploadProgress).toBeDefined();
    expect(progressSpy).toHaveBeenCalledWith(25);
    expect(progressSpy).toHaveBeenCalledWith(50);
    expect(progressSpy).toHaveBeenCalledWith(100);
    expect(progressSpy).toHaveBeenCalledTimes(3);
  });

  it('does not emit progress when event.total is missing or zero (indeterminate)', async () => {
    const progressSpy = jest.fn();

    jest.spyOn(ApiClient, 'post').mockImplementation(async (_url: string, _data?: any, config?: any) => {
      config.onUploadProgress?.({ loaded: 50 });
      config.onUploadProgress?.({ loaded: 50, total: 0 });
      return {
        statusCode: 200,
        message: 'OK',
        data: { url: 'https://res.cloudinary.com/demo/image/upload/photo.jpg' },
      } as any;
    });

    await OrdersApi.uploadImage('file:///photo.jpg', { onProgress: progressSpy });
    expect(progressSpy).not.toHaveBeenCalled();
  });

  it('forwards AbortSignal to ApiClient.post and supports abort cancellation', async () => {
    let capturedConfig: any = null;
    const controller = new AbortController();

    jest.spyOn(ApiClient, 'post').mockImplementation(async (_url: string, _data?: any, config?: any) => {
      capturedConfig = config;
      if (config?.signal?.aborted) {
        throw new Error('canceled');
      }
      return {
        statusCode: 200,
        message: 'OK',
        data: { url: 'https://res.cloudinary.com/demo/image/upload/photo.jpg' },
      } as any;
    });

    controller.abort();
    await expect(
      OrdersApi.uploadImage('file:///photo.jpg', 'booking_issue', { signal: controller.signal }),
    ).rejects.toThrow('canceled');

    expect(capturedConfig?.signal).toBe(controller.signal);
  });
});
