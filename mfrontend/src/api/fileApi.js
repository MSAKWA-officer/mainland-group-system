import { api } from './client';

export const upload = (file) => {
  const body = new FormData(); body.append('file', file);
  return api.post('/files', body).then((r) => r.data);
};
export const downloadUrl = (id) => `/api/files/${id}`;
