import emailHandler from './email-attachment-handler';
import webdavHandler from './webdav';

export default {
  async fetch(request, env, ctx) {
    return webdavHandler.fetch(request, env, ctx);
  },
  async email(message, env, ctx) {
    return emailHandler.email(message, env, ctx);
  },
};
