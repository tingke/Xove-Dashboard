/* ============================================================
   YAML 标量安全序列化 —— 纯函数（无 Obsidian 依赖，可单测）。
   原 frontmatterWriter 内联实现外移至此：tasksImport 等纯逻辑
   模块需要同样的转义规则，但测试链不能引入 obsidian 包。
   ============================================================ */

/**
 * YAML 标量安全序列化：普通短文本保持裸写（与历史文件格式一致），
 * 含 YAML 特殊字符/换行/首尾空白的值用 JSON.stringify 包成双引号标量
 * （JSON 双引号字符串是合法 YAML 双引号标量，转义集兼容）。
 */
export function yamlScalar(value: string): string {
	if (value === '') return "''";
	// 需要加引号的情形：
	// - 含换行/回车、": "、结尾冒号、" #"（注释）
	// - 以 YAML 特殊起始符开头（# - ? & * ! | > ' " % @ ` [ ] { } ,）
	// - 首尾空白
	const unsafe =
		/[\n\r]/.test(value) ||
		value.includes(': ') ||
		value.endsWith(':') ||
		value.includes(' #') ||
		value.trim() !== value ||
		/^[#\-?&*!|>'"%@`\[\]{},]/.test(value);
	return unsafe ? JSON.stringify(value) : value;
}
