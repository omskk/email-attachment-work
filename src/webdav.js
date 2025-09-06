export default {
  /**
   * 处理 HTTP 请求以提供 WebDAV 接口。
   * @param {Request} request - 传入的 HTTP 请求。
   * @param {object} env - 包含绑定的环境对象。
   * @param {object} ctx - 执行上下文。
   */
  async fetch(request, env, ctx) {
    // 1. 基本身份验证检查
    if (!isAuthorized(request, env)) {
      return new Response('未授权', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="WebDAV"',
        },
      });
    }

    const url = new URL(request.url);
    // 关键修复：WebDAV 客户端发来的路径是 URL 编码的，必须解码才能在 R2 中找到对应的文件。
    const path = decodeURIComponent(url.pathname.substring(1)); 
    console.log(`WebDAV 请求: Method=${request.method}, Decoded Path=${path}, Original URL=${request.url}`);

    switch (request.method) {
      case 'OPTIONS':
        return new Response(null, {
          status: 200,
          headers: {
            'Allow': 'OPTIONS, GET, HEAD, PROPFIND',
            'DAV': '1',
          },
        });

      case 'PROPFIND':
        return handlePropfind(path, env);

      case 'GET':
      case 'HEAD':
        return handleGet(request, path, env);

      default:
        return new Response('方法不允许', { status: 405 });
    }
  },
};

/**
 * 检查基本身份验证凭据。
 * @param {Request} request
 * @param {object} env
 * @returns {boolean}
 */
function isAuthorized(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  const encodedCreds = authHeader.substring(6);
  try {
    const decodedCreds = atob(encodedCreds);
    const [user, password] = decodedCreds.split(':');
    return user === env.WEBDAV_USER && password === env.WEBDAV_PASSWORD;
  } catch (e) {
    return false;
  }
}

/**
 * 处理 R2 中文件的 GET 和 HEAD 请求。
 * @param {Request} request
 * @param {string} path
 * @param {object} env
 * @returns {Promise<Response>}
 */
async function handleGet(request, path, env) {
  console.log(`WebDAV GET: 尝试获取 R2 Key: "${path}"`);
  if (!path) {
    console.error("WebDAV GET 错误: 请求的路径为空。");
    return new Response('未找到', { status: 404 });
  }

  // 断点续传支持: R2's get() 会自动处理我们传入的 Range 头
  const object = await env.R2_BUCKET.get(path, {
    range: request.headers,
  });

  if (object === null) {
    console.error(`WebDAV GET 错误: R2 中未找到 Key: "${path}"`);
    return new Response('未找到', { status: 404 });
  }
  
  console.log(`WebDAV GET 成功: 已找到 Key: "${path}"`);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  // 告知客户端我们支持范围请求
  headers.set('accept-ranges', 'bytes');

  // 确保 Content-Type 存在，为下载提供保障
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/octet-stream');
    console.log(`WebDAV GET: Content-Type 未设置, 已默认设为 application/octet-stream`);
  }

  // 添加 Content-Disposition 头，强制下载并提供正确的文件名 (支持中文)
  const filename = path.split('/').pop();
  const encodedFilename = encodeURIComponent(filename);
  headers.set('content-disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
  console.log(`WebDAV GET: 设置 Content-Disposition, filename=${filename}`);

  // 如果 R2 返回了部分内容 (有 range 属性)，则状态码必须是 206
  const status = object.range ? 206 : 200;
  if (object.range) {
    console.log(`WebDAV GET: 返回部分内容 (206), Range: ${JSON.stringify(object.range)}`);
  }

  if (request.method === 'HEAD') {
    return new Response(null, { headers, status });
  }

  return new Response(object.body, { headers, status });
}

/**
 * 处理 PROPFIND 请求以列出 R2 中的文件。
 * @param {string} path
 * @param {object} env
 * @returns {Promise<Response>}
 */
async function handlePropfind(path, env) {
  const { objects } = await env.R2_BUCKET.list();
  const filesXml = objects.map(obj => `
    <D:response>
      <D:href>/${encodeURIComponent(obj.key)}</D:href>
      <D:propstat>
        <D:prop>
          <D:displayname>${escapeXml(obj.key)}</D:displayname>
          <D:getcontentlength>${obj.size}</D:getcontentlength>
          <D:getlastmodified>${obj.uploaded.toUTCString()}</D:getlastmodified>
          <D:resourcetype/>
        </D:prop>
        <D:status>HTTP/1.1 200 OK</D:status>
      </D:propstat>
    </D:response>
  `).join('');

  const xml = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>R2 存储桶</D:displayname>
        <D:resourcetype><D:collection/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  ${filesXml}
</D:multistatus>`;

  return new Response(xml, {
    status: 207, // Multi-Status
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}

/**
 * 对字符串进行 XML 转义，防止文件名中的特殊字符破坏 XML 结构。
 * @param {string} unsafe - 待转义的字符串。
 * @returns {string} - 转义后的安全字符串。
 */
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
    }
  });
}
