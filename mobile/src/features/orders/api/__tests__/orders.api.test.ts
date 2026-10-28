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
});
