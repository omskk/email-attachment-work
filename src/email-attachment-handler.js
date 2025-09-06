import * as PostalMime from 'postal-mime'

/**
 * 处理邮件附件的Worker
 * 检查邮件是否包含附件，并将附件存储到R2中
 */
export default {
  /**
   * 处理邮件的入口函数
   */
  async email(message, env, ctx) {
    console.log('开始处理邮件...')
    await handleEmail(message, env, ctx)
    console.log('邮件处理完成')
  }
}

/**
 * 清理文件名，移除不安全字符。
 * 重构后的版本，提高了代码质量和可维护性。
 * @param {string} filename 原始文件名
 * @returns {string} 清理后的文件名
 */
function sanitizeFilename(filename) {
  console.log(`开始清理文件名: "${filename}"`);

  if (!filename) {
    return 'unnamed_file';
  }

  // 步骤 1: 分离文件名和扩展名
  const extensionMatch = filename.match(/\.[^./\\]+$/);
  const extension = extensionMatch ? extensionMatch[0] : '';
  let name = extension ? filename.slice(0, -extension.length) : filename;

  // 步骤 2: 定义并应用一系列清理规则
  const rules = [
    // 移除控制字符和空字节
    { from: /[\x00-\x1F\x7F\u0000]/g, to: '' },
    // 替换文件系统中非法的字符为下划线
    { from: /[<>:"/\\|?*]/g, to: '_' },
    // 移除特定的营销或元数据字符串
    { from: /Z-Library|Unknown|作者：/gi, to: '' },
    // 移除装饰性括号
    { from: /[《》【】]/g, to: '' },
    // 将各种括号统一替换为连字符
    { from: /[（()]/g, to: '-' },
    // 移除右括号
    { from: /[）]/g, to: '' },
    // 移除所有空白字符
    { from: /\s+/g, to: '' },
  ];

  name = rules.reduce((acc, rule) => acc.replace(rule.from, rule.to), name);

  // 步骤 3: 后期处理，清理连字符
  name = name
    // 将多个连续的连字符替换为单个
    .replace(/-+/g, '-')
    // 移除文件名开头和结尾的连字符
    .replace(/^-+|-+$/g, '');

  // 步骤 4: 重新组装并验证
  // 如果清理后文件名为空，则使用默认名称
  if (!name) {
    name = 'unnamed_file';
  }

  const sanitized = name + extension;
  console.log(`清理后的文件名: "${sanitized}"`);
  return sanitized;
}

/**
 * 处理邮件主函数
 * @param message 邮件消息
 * @param env 环境变量
 * @param ctx 执行上下文
 */
async function handleEmail(message, env, ctx) {
  try {
    console.log('开始解析邮件...')
    // 创建解析器
    const parser = new PostalMime.default()
    
    // 解析邮件内容
    const rawEmail = new Response(message.raw)
    const email = await parser.parse(await rawEmail.arrayBuffer())
    console.log(`邮件解析成功 - 主题: "${email.subject}", 发件人: ${email.from?.address || '未知'}`)
    
    // 检查邮件是否包含附件
    if (!email.attachments || email.attachments.length === 0) {
      console.log('邮件不包含附件')
      return
    }
    
    console.log(`发现 ${email.attachments.length} 个附件`)
    
    // 处理所有附件
    for (const attachment of email.attachments) {
      if (!attachment.filename || !attachment.content) {
        console.log('附件无效: 缺少文件名或内容')
        continue
      }
      
      console.log(`处理附件: "${attachment.filename}", 类型: ${attachment.mimeType || '未知'}`)
      
      // 构建文件路径 - 清理文件名后再存储
      const filePath = sanitizeFilename(attachment.filename)
      
      // 存储到R2
      if (env.R2_BUCKET) {
        console.log(`开始存储附件: "${filePath}"`)
        await env.R2_BUCKET.put(filePath, attachment.content, {
          httpMetadata: {
            contentType: attachment.mimeType || 'application/octet-stream',
          }
        })
        console.log(`附件存储成功: "${filePath}", 大小: ${attachment.content.length} 字节`)
      } else {
        console.error('R2_BUCKET未配置，无法存储附件')
      }
    }
    
    // 可选：记录统计信息到Analytics Engine
    if (env.DMARC_ANALYTICS) {
      console.log('记录统计信息到Analytics Engine')
      env.DMARC_ANALYTICS.writeDataPoint({
        blobs: [email.messageId || '', email.from?.address || '', email.subject || ''],
        doubles: [email.attachments.length, Date.now()],
        indexes: [email.messageId?.slice(0, 32) || Date.now().toString()],
      })
      console.log('统计信息记录完成')
    }
    
  } catch (error) {
    console.error('处理邮件时出错:', error)
    console.error('错误详情:', error.stack || '无堆栈信息')
    throw error
  }
}
