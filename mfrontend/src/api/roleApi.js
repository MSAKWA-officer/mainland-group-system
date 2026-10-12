import { api } from './client';

export const listRoles = () => api.get('/rbac/roles').then((r) => r.data);
export const listPermissions = () => api.get('/rbac/permissions').then((r) => r.data);
export const setPermissions = (id, permissionIds) => api.put(`/rbac/roles/${id}/permissions`, { permissionIds });
