import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary';
import { ApiError } from '../utils/ApiError';

export const uploadImage = (buffer: Buffer, folder: string): Promise<string> => {
  if (!isCloudinaryConfigured) {
    throw ApiError.unavailable('Image uploads are not configured on this server');
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `stockbid/${folder}`, resource_type: 'image' },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
};
