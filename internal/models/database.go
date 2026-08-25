package models

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	_ "modernc.org/sqlite"
)

type Database struct {
	db *sql.DB
}

type UserRecord struct {
	ID           int
	Username     string
	PasswordHash string
	Role         string
	Department   string
	CreatedAt    string
}

type AssessmentPeriod struct {
	ID               int64
	Name             string
	FormName         string
	Status           string
	CreatedAt        string
	ParticipantRoles string // 逗号分隔的参与角色，空=全员(非管理员)
	ReviewChain      string // JSON: {scored,approved,finalized} 角色，空=默认
	GradeConfig      string // JSON: {enabled,group_by,rules} 等级分布配置，空=未启用
}

type AssessmentRecord struct {
	ID         int64
	PeriodID   int64
	UserID     int
	Username   string
	Department string
	FormName   string
	TableName  string
	RowID      int64
	Status     string
	Scores     string // JSON: {scored:{role,username,score,weight}, approved:..., finalized:...}
	TotalScore *float64
	ReviewedBy string
	UpdatedAt  string
}

type Department struct {
	ID        int64
	Name      string
	CreatedAt string
}

type RoleDefinition struct {
	Code        string `json:"code"`
	Label       string `json:"label"`
	Description string `json:"description"`
	Builtin     bool   `json:"builtin"`
}

type ShareLinkRecord struct {
	Token     string
	FormName  string
	CreatedBy int
	CreatedAt string
}

func NewDatabase(dbPath, dbType string) (*Database, error) {
	// Ensure dbType is "sqlite"
	if dbType != "sqlite" && dbType != "sqlite3" {
		return nil, fmt.Errorf("unsupported database type: %s", dbType)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	return &Database{db: db}, nil
}

func (d *Database) Close() error {
	return d.db.Close()
}

// ---- 考核模块 ----

func (d *Database) CreateAssessmentPeriod(name, formName, participantRoles, reviewChain, gradeConfig string) (int64, error) {
	res, err := d.db.Exec(
		`INSERT INTO assessment_periods (name, form_name, participant_roles, review_chain, grade_config) VALUES (?, ?, ?, ?, ?)`,
		name, formName, participantRoles, reviewChain, gradeConfig,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) UpdateAssessmentPeriod(id int64, name, formName, participantRoles, reviewChain, gradeConfig string) error {
	_, err := d.db.Exec(
		`UPDATE assessment_periods SET name = ?, form_name = ?, participant_roles = ?, review_chain = ?, grade_config = ? WHERE id = ?`,
		name, formName, participantRoles, reviewChain, gradeConfig, id,
	)
	return err
}

func (d *Database) DeleteAssessmentPeriod(id int64) error {
	if _, err := d.db.Exec(`DELETE FROM assessment_records WHERE period_id = ?`, id); err != nil {
		return err
	}
	_, err := d.db.Exec(`DELETE FROM assessment_periods WHERE id = ?`, id)
	return err
}

func (d *Database) ListAssessmentPeriods() ([]AssessmentPeriod, error) {
	rows, err := d.db.Query(`SELECT id, name, form_name, status, created_at, participant_roles, review_chain, grade_config FROM assessment_periods ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]AssessmentPeriod, 0)
	for rows.Next() {
		var p AssessmentPeriod
		if err := rows.Scan(&p.ID, &p.Name, &p.FormName, &p.Status, &p.CreatedAt, &p.ParticipantRoles, &p.ReviewChain, &p.GradeConfig); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (d *Database) GetActiveAssessmentPeriod() (*AssessmentPeriod, error) {
	var p AssessmentPeriod
	err := d.db.QueryRow(
		`SELECT id, name, form_name, status, created_at, participant_roles, review_chain, grade_config FROM assessment_periods WHERE status='active' ORDER BY id DESC LIMIT 1`,
	).Scan(&p.ID, &p.Name, &p.FormName, &p.Status, &p.CreatedAt, &p.ParticipantRoles, &p.ReviewChain, &p.GradeConfig)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (d *Database) GetAssessmentPeriodByID(id int64) (*AssessmentPeriod, error) {
	var p AssessmentPeriod
	err := d.db.QueryRow(
		`SELECT id, name, form_name, status, created_at, participant_roles, review_chain, grade_config FROM assessment_periods WHERE id = ? LIMIT 1`,
		id,
	).Scan(&p.ID, &p.Name, &p.FormName, &p.Status, &p.CreatedAt, &p.ParticipantRoles, &p.ReviewChain, &p.GradeConfig)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (d *Database) CreateAssessmentRecord(rec AssessmentRecord) (int64, error) {
	res, err := d.db.Exec(
		`INSERT INTO assessment_records (period_id, user_id, username, department, form_name, table_name, row_id, status, reviewed_by)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		rec.PeriodID, rec.UserID, rec.Username, rec.Department, rec.FormName, rec.TableName, rec.RowID, rec.Status, rec.ReviewedBy,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) GetAssessmentRecordByUser(periodID int64, userID int, formName string) (*AssessmentRecord, error) {
	var r AssessmentRecord
	err := d.db.QueryRow(
		`SELECT id, period_id, user_id, username, department, form_name, table_name, row_id, status, scores, total_score, reviewed_by, updated_at
		 FROM assessment_records WHERE period_id=? AND user_id=? AND form_name=? LIMIT 1`,
		periodID, userID, formName,
	).Scan(&r.ID, &r.PeriodID, &r.UserID, &r.Username, &r.Department, &r.FormName, &r.TableName, &r.RowID, &r.Status, &r.Scores, &r.TotalScore, &r.ReviewedBy, &r.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (d *Database) UpdateAssessmentRecordRow(recordID, rowID int64) error {
	_, err := d.db.Exec(
		`UPDATE assessment_records SET row_id=?, updated_at=datetime('now') WHERE id=?`,
		rowID, recordID,
	)
	return err
}

func (d *Database) DeleteRow(tableName string, rowID int64) error {
	_, err := d.db.Exec(fmt.Sprintf("DELETE FROM `%s` WHERE id = ?", tableName), rowID)
	return err
}

func (d *Database) GetAssessmentRecordByID(id int64) (*AssessmentRecord, error) {
	var r AssessmentRecord
	err := d.db.QueryRow(
		`SELECT id, period_id, user_id, username, department, form_name, table_name, row_id, status, scores, total_score, reviewed_by, updated_at
		 FROM assessment_records WHERE id=? LIMIT 1`,
		id,
	).Scan(&r.ID, &r.PeriodID, &r.UserID, &r.Username, &r.Department, &r.FormName, &r.TableName, &r.RowID, &r.Status, &r.Scores, &r.TotalScore, &r.ReviewedBy, &r.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// ListAssessmentRecords 列出考核记录；status/department 为空表示不限。
func (d *Database) ListAssessmentRecords(periodID int64, status, department string) ([]AssessmentRecord, error) {
	query := `SELECT id, period_id, user_id, username, department, form_name, table_name, row_id, status, scores, total_score, reviewed_by, updated_at
		FROM assessment_records WHERE 1=1`
	args := make([]interface{}, 0)
	if periodID > 0 {
		query += ` AND period_id=?`
		args = append(args, periodID)
	}
	if status != "" {
		query += ` AND status=?`
		args = append(args, status)
	}
	if department != "" {
		query += ` AND department=?`
		args = append(args, department)
	}
	query += ` ORDER BY id ASC`
	rows, err := d.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]AssessmentRecord, 0)
	for rows.Next() {
		var r AssessmentRecord
		if err := rows.Scan(&r.ID, &r.PeriodID, &r.UserID, &r.Username, &r.Department, &r.FormName, &r.TableName, &r.RowID, &r.Status, &r.Scores, &r.TotalScore, &r.ReviewedBy, &r.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (d *Database) UpdateAssessmentRecordStatus(id int64, status, reviewedBy string, totalScore *float64) error {
	_, err := d.db.Exec(
		`UPDATE assessment_records SET status=?, reviewed_by=?, total_score=?, updated_at=datetime('now') WHERE id=?`,
		status, reviewedBy, totalScore, id,
	)
	return err
}

// ResetAssessmentRecordStatus 管理员将记录恢复为“已填报”，允许员工重新提交。
func (d *Database) ResetAssessmentRecordStatus(id int64) error {
	_, err := d.db.Exec(
		`UPDATE assessment_records SET status='submitted', reviewed_by='', scores='', total_score=NULL, updated_at=datetime('now') WHERE id=?`,
		id,
	)
	return err
}

// SetAssessmentRecordResult 写入某阶段的评分结果并推进状态。
func (d *Database) SetAssessmentRecordResult(id int64, status, reviewedBy, scoresJSON string, total *float64) error {
	_, err := d.db.Exec(
		`UPDATE assessment_records SET status=?, reviewed_by=?, scores=?, total_score=?, updated_at=datetime('now') WHERE id=?`,
		status, reviewedBy, scoresJSON, total, id,
	)
	return err
}

// UpdateRowData 更新表单提交行的 data JSON 与指定的列（repeated_group 列存 JSON 字符串）。
func (d *Database) UpdateRowData(tableName string, rowID int64, data map[string]interface{}, groupJSON map[string]string) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("序列化 data 失败：%v", err)
	}
	columns := []string{"data"}
	values := []interface{}{jsonData}
	for col, val := range groupJSON {
		columns = append(columns, fmt.Sprintf("`%s`", col))
		values = append(values, val)
	}
	values = append(values, rowID)
	query := fmt.Sprintf("UPDATE `%s` SET %s WHERE id = ?",
		tableName, strings.Join(columns, " = ?, ")+" = ?")
	_, err = d.db.Exec(query, values...)
	return err
}

// columnExists 检查表中的列是否存在
func (d *Database) columnExists(tableName, columnName string) bool {
	query := `SELECT COUNT(*) FROM pragma_table_info(?) WHERE name=?`
	var count int
	err := d.db.QueryRow(query, tableName, columnName).Scan(&count)
	return err == nil && count > 0
}

// getTableColumns 获取表的所有列名
func (d *Database) getTableColumns(tableName string) []string {
	rows, err := d.db.Query(`SELECT name FROM pragma_table_info(?)`, tableName)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var columns []string
	for rows.Next() {
		var col string
		if err := rows.Scan(&col); err != nil {
			continue
		}
		columns = append(columns, col)
	}
	return columns
}

func (d *Database) TableExists(tableName string) bool {
	query := `SELECT COUNT(name) FROM sqlite_master WHERE type='table' AND name=?`
	var count int
	if err := d.db.QueryRow(query, tableName).Scan(&count); err != nil {
		return false
	}
	return count > 0
}

func (d *Database) CreateTable(tableName string, fields []FieldInfo) error {
	// 构建动态列结构
	columns := make([]string, 0)
	columns = append(columns, "id INTEGER PRIMARY KEY AUTOINCREMENT")

	// 添加 data 字段用于存储原始 JSON（备份用途）
	columns = append(columns, "data TEXT NOT NULL")

	// 根据字段定义创建列
	for _, field := range fields {
		colType := d.getFieldType(field.Type)
		columns = append(columns, fmt.Sprintf("`%s` %s", field.Name, colType))
	}

	// 添加系统字段
	columns = append(columns, "owner_user_id INTEGER")
	columns = append(columns, "_submitted_at TEXT")
	columns = append(columns, "_ip TEXT")

	query := fmt.Sprintf("CREATE TABLE IF NOT EXISTS `%s` (%s)", tableName, strings.Join(columns, ", "))
	_, err := d.db.Exec(query)
	return err
}

func (d *Database) ensureFormSystemColumns(tableName string) error {
	systemCols := map[string]string{
		"owner_user_id": "INTEGER",
		"_submitted_at": "TEXT",
		"_ip":           "TEXT",
	}

	for col, typ := range systemCols {
		if d.columnExists(tableName, col) {
			continue
		}
		query := fmt.Sprintf("ALTER TABLE `%s` ADD COLUMN `%s` %s", tableName, col, typ)
		if _, err := d.db.Exec(query); err != nil && !strings.Contains(err.Error(), "duplicate column name") {
			return fmt.Errorf("添加系统列 %s 失败：%v", col, err)
		}
	}

	return nil
}

// getFieldType 根据表单字段类型返回数据库字段类型
func (d *Database) getFieldType(formFieldType string) string {
	switch formFieldType {
	case "number", "range":
		return "REAL"
	case "date", "time":
		return "TEXT" // SQLite 没有专门的日期类型
	case "repeated_group":
		return "TEXT" // 表格行数据以 JSON 数组存储
	default:
		return "TEXT"
	}
}

// UpdateTableSchema 动态更新表结构（添加新列）
func (d *Database) UpdateTableSchema(tableName string, oldFields []FieldInfo, newFields []FieldInfo) error {
	// 如果表不存在，直接创建
	if !d.TableExists(tableName) {
		return d.CreateTable(tableName, newFields)
	}

	// 获取现有列名
	existingCols := make(map[string]bool)
	for _, f := range oldFields {
		existingCols[f.Name] = true
	}

	// 添加新列
	for _, field := range newFields {
		if !existingCols[field.Name] {
			colType := d.getFieldType(field.Type)
			query := fmt.Sprintf("ALTER TABLE `%s` ADD COLUMN `%s` %s", tableName, field.Name, colType)
			if _, err := d.db.Exec(query); err != nil {
				// 如果是重复列的错误，忽略（静默处理）
				if !strings.Contains(err.Error(), "duplicate column name") {
					return fmt.Errorf("添加列 %s 失败：%v", field.Name, err)
				}
			}
		}
	}

	if err := d.ensureFormSystemColumns(tableName); err != nil {
		return err
	}

	return nil
}

func (d *Database) Insert(tableName string, data map[string]interface{}) (int64, error) {
	// 动态构建列名和占位符
	columns := make([]string, 0)
	values := make([]interface{}, 0)
	placeholders := make([]string, 0)

	// 调试：打印插入信息
	fmt.Printf("💾 准备插入数据到表：%s\n", tableName)
	fmt.Printf("📦 原始数据：%v\n", data)

	// 首先处理 data 字段（存储原始 JSON）
	jsonData, err := json.Marshal(data)
	if err != nil {
		return 0, fmt.Errorf("序列化 data 失败：%v", err)
	}
	columns = append(columns, "data")
	values = append(values, jsonData)
	placeholders = append(placeholders, "?")

	for key, val := range data {
		// 跳过系统字段（稍后单独处理）
		if key == "owner_user_id" || key == "_submitted_at" || key == "_ip" {
			continue
		}

		// 检查列是否存在
		if !d.columnExists(tableName, key) {
			fmt.Printf("❌ 错误：表 %s 中不存在列 %s\n", tableName, key)
			fmt.Printf("📋 表 %s 的可用列：%v\n", tableName, d.getTableColumns(tableName))
			return 0, fmt.Errorf("表 %s 没有列 %s", tableName, key)
		}

		// 处理数组类型（checkbox 多选 / repeated_group 表格行）
		if arr, ok := val.([]interface{}); ok {
			if isObjectArray(arr) {
				// repeated_group：对象数组存为 JSON 字符串
				if b, err := json.Marshal(arr); err == nil {
					val = string(b)
				}
				columns = append(columns, fmt.Sprintf("`%s`", key))
				values = append(values, val)
				placeholders = append(placeholders, "?")
				continue
			}
			// checkbox：将字符串数组转换为逗号分隔的字符串
			strArr := make([]string, len(arr))
			for i, v := range arr {
				if s, ok := v.(string); ok {
					strArr[i] = s
				} else {
					strArr[i] = fmt.Sprintf("%v", v)
				}
			}
			val = strings.Join(strArr, ",")
		} else if arr, ok := val.([]string); ok {
			// 处理字符串数组
			val = strings.Join(arr, ",")
		}

		columns = append(columns, fmt.Sprintf("`%s`", key))
		values = append(values, val)
		placeholders = append(placeholders, "?")
	}

	// 添加系统字段
	ownerUserID := 0
	if v, ok := data["owner_user_id"].(float64); ok {
		ownerUserID = int(v)
	} else if v, ok := data["owner_user_id"].(int); ok {
		ownerUserID = v
	}
	submittedAt := ""
	ip := ""
	if v, ok := data["_submitted_at"].(string); ok {
		submittedAt = v
	}
	if v, ok := data["_ip"].(string); ok {
		ip = v
	}

	columns = append(columns, "owner_user_id", "_submitted_at", "_ip")
	values = append(values, ownerUserID, submittedAt, ip)
	placeholders = append(placeholders, "?", "?", "?")

	query := fmt.Sprintf("INSERT INTO `%s` (%s) VALUES (%s)",
		tableName,
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "))

	fmt.Printf("✅ 执行插入：SQL=%s\n", query)

	res, err := d.db.Exec(query, values...)
	if err != nil {
		fmt.Printf("❌ 插入失败：%v\n", err)
		return 0, err
	}
	return res.LastInsertId()
}

// isObjectArray 判断数组元素是否为对象（repeated_group 的行数据）。
func isObjectArray(arr []interface{}) bool {
	for _, v := range arr {
		switch v.(type) {
		case map[string]interface{}, map[string]string:
			return true
		}
	}
	return false
}

func (d *Database) EnsureUserTable() error {
	query := `CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT NOT NULL UNIQUE,
		password_hash TEXT NOT NULL,
		role TEXT NOT NULL DEFAULT 'user',
		department TEXT NOT NULL DEFAULT '',
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`
	if _, err := d.db.Exec(query); err != nil {
		return err
	}
	// 老库兼容：补充 department 列
	if !d.columnExists("users", "department") {
		if _, err := d.db.Exec(`ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT ''`); err != nil {
			return err
		}
	}
	return nil
}

func (d *Database) EnsureRoleTable() error {
	if _, err := d.db.Exec(`CREATE TABLE IF NOT EXISTS role_definitions (
		code TEXT PRIMARY KEY,
		label TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		builtin INTEGER NOT NULL DEFAULT 0
	)`); err != nil {
		return err
	}
	seeds := []RoleDefinition{
		{"user", "普通用户", "可填写有权限访问的表单。", true},
		{"admin", "管理员", "管理表单、用户、部门和系统设置。", true},
		{"staff", "职员", "普通业务人员，参与日常填报。", true},
		{"dept_head", "部门负责人", "负责本部门员工及部门内考核流程。", true},
		{"senior_leader", "部门以上领导", "可配置多个部门的管理范围。", true},
		{"division_leader", "分管领导", "负责所辖多个部门的分管与评分。", true},
		{"top_leader", "主管领导", "负责更高层级的部门管理与评分。", true},
	}
	for _, role := range seeds {
		if _, err := d.db.Exec(`INSERT OR IGNORE INTO role_definitions (code, label, description, builtin) VALUES (?, ?, ?, 1)`, role.Code, role.Label, role.Description); err != nil {
			return err
		}
	}
	return nil
}

func (d *Database) ListRoleDefinitions() ([]RoleDefinition, error) {
	rows, err := d.db.Query(`SELECT code, label, description, builtin FROM role_definitions ORDER BY builtin DESC, code`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]RoleDefinition, 0)
	for rows.Next() {
		var role RoleDefinition
		var builtin int
		if err := rows.Scan(&role.Code, &role.Label, &role.Description, &builtin); err != nil {
			return nil, err
		}
		role.Builtin = builtin != 0
		out = append(out, role)
	}
	return out, rows.Err()
}

func (d *Database) RoleExists(code string) (bool, error) {
	var n int
	err := d.db.QueryRow(`SELECT COUNT(1) FROM role_definitions WHERE code = ?`, code).Scan(&n)
	return n > 0, err
}

func (d *Database) CreateRoleDefinition(role RoleDefinition) error {
	_, err := d.db.Exec(`INSERT INTO role_definitions (code, label, description, builtin) VALUES (?, ?, ?, 0)`, role.Code, role.Label, role.Description)
	return err
}

func (d *Database) UpdateRoleDefinition(code, label, description string) error {
	_, err := d.db.Exec(`UPDATE role_definitions SET label = ?, description = ? WHERE code = ? AND builtin = 0`, label, description, code)
	return err
}

func (d *Database) DeleteRoleDefinition(code string) error {
	var builtin int
	if err := d.db.QueryRow(`SELECT builtin FROM role_definitions WHERE code = ?`, code).Scan(&builtin); err != nil {
		return err
	}
	if builtin != 0 {
		return fmt.Errorf("内置角色不可删除")
	}
	var users int
	if err := d.db.QueryRow(`SELECT COUNT(1) FROM users WHERE role = ?`, code).Scan(&users); err != nil {
		return err
	}
	if users > 0 {
		return fmt.Errorf("角色仍被用户使用")
	}
	_, err := d.db.Exec(`DELETE FROM role_definitions WHERE code = ?`, code)
	return err
}

// EnsureAssessmentTables 创建考核模块所需表。
func (d *Database) EnsureAssessmentTables() error {
	periods := `CREATE TABLE IF NOT EXISTS assessment_periods (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		form_name TEXT NOT NULL DEFAULT '',
		status TEXT NOT NULL DEFAULT 'active',
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`
	if _, err := d.db.Exec(periods); err != nil {
		return err
	}
	records := `CREATE TABLE IF NOT EXISTS assessment_records (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		period_id INTEGER NOT NULL,
		user_id INTEGER NOT NULL,
		username TEXT NOT NULL,
		department TEXT NOT NULL DEFAULT '',
		form_name TEXT NOT NULL,
		table_name TEXT NOT NULL,
		row_id INTEGER NOT NULL,
		status TEXT NOT NULL DEFAULT 'submitted',
		total_score REAL,
		reviewed_by TEXT NOT NULL DEFAULT '',
		updated_at TEXT NOT NULL DEFAULT (datetime('now')),
		UNIQUE(period_id, user_id, form_name)
	)`
	_, err := d.db.Exec(records)
	if err != nil {
		return err
	}
	// 老库迁移：补充参与角色/评分链列
	addCols := []struct{ name, ddl string }{
		{"participant_roles", `ALTER TABLE assessment_periods ADD COLUMN participant_roles TEXT NOT NULL DEFAULT ''`},
		{"review_chain", `ALTER TABLE assessment_periods ADD COLUMN review_chain TEXT NOT NULL DEFAULT ''`},
		{"grade_config", `ALTER TABLE assessment_periods ADD COLUMN grade_config TEXT NOT NULL DEFAULT ''`},
		{"scores", `ALTER TABLE assessment_records ADD COLUMN scores TEXT NOT NULL DEFAULT ''`},
	}
	for _, c := range addCols {
		table := "assessment_periods"
		if c.name == "scores" {
			table = "assessment_records"
		}
		if !d.columnExists(table, c.name) {
			if _, err := d.db.Exec(c.ddl); err != nil {
				return err
			}
		}
	}
	return nil
}

// EnsureDepartmentTables 创建部门表与领导管理范围关联表，并把现有用户的部门文本回填为部门记录。
func (d *Database) EnsureDepartmentTables() error {
	depts := `CREATE TABLE IF NOT EXISTS departments (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`
	if _, err := d.db.Exec(depts); err != nil {
		return err
	}
	links := `CREATE TABLE IF NOT EXISTS leader_departments (
		user_id INTEGER NOT NULL,
		department_id INTEGER NOT NULL,
		PRIMARY KEY (user_id, department_id)
	)`
	if _, err := d.db.Exec(links); err != nil {
		return err
	}
	// 回填：把 users.department 中已有的部门文本导入部门表（去重）
	_, _ = d.db.Exec(`
		INSERT OR IGNORE INTO departments (name)
		SELECT DISTINCT department FROM users WHERE TRIM(department) <> ''`)
	return nil
}

func (d *Database) ListDepartments() ([]Department, error) {
	rows, err := d.db.Query(`SELECT id, name, created_at FROM departments ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Department, 0)
	for rows.Next() {
		var dep Department
		if err := rows.Scan(&dep.ID, &dep.Name, &dep.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, dep)
	}
	return out, rows.Err()
}

func (d *Database) CreateDepartment(name string) (int64, error) {
	res, err := d.db.Exec(`INSERT INTO departments (name) VALUES (?)`, name)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) DeleteDepartment(id int64) error {
	if _, err := d.db.Exec(`DELETE FROM leader_departments WHERE department_id = ?`, id); err != nil {
		return err
	}
	_, err := d.db.Exec(`DELETE FROM departments WHERE id = ?`, id)
	return err
}

func (d *Database) DepartmentNameByID(id int64) (string, error) {
	var name string
	err := d.db.QueryRow(`SELECT name FROM departments WHERE id = ?`, id).Scan(&name)
	return name, err
}

func (d *Database) SetLeaderDepartments(userID int, departmentIDs []int64) error {
	if _, err := d.db.Exec(`DELETE FROM leader_departments WHERE user_id = ?`, userID); err != nil {
		return err
	}
	for _, id := range departmentIDs {
		if _, err := d.db.Exec(
			`INSERT OR IGNORE INTO leader_departments (user_id, department_id) VALUES (?, ?)`,
			userID, id,
		); err != nil {
			return err
		}
	}
	return nil
}

func (d *Database) GetLeaderDepartments(userID int) ([]int64, error) {
	rows, err := d.db.Query(`SELECT department_id FROM leader_departments WHERE user_id = ? ORDER BY department_id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func (d *Database) CreateUser(username, passwordHash, role, department string) (int64, error) {
	query := `INSERT INTO users (username, password_hash, role, department, created_at) VALUES (?, ?, ?, ?, datetime('now'))`
	res, err := d.db.Exec(query, username, passwordHash, role, department)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) UpdateUserDepartment(userID int, department string) error {
	_, err := d.db.Exec(`UPDATE users SET department = ? WHERE id = ?`, department, userID)
	return err
}

func (d *Database) GetUserByUsername(username string) (*UserRecord, error) {
	query := `SELECT id, username, password_hash, role, department, created_at FROM users WHERE username = ? LIMIT 1`
	var u UserRecord
	err := d.db.QueryRow(query, username).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.Department, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (d *Database) GetUserByID(id int) (*UserRecord, error) {
	query := `SELECT id, username, password_hash, role, department, created_at FROM users WHERE id = ? LIMIT 1`
	var u UserRecord
	err := d.db.QueryRow(query, id).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.Department, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (d *Database) CountUsers() (int64, error) {
	query := `SELECT COUNT(*) FROM users`
	var count int64
	err := d.db.QueryRow(query).Scan(&count)
	return count, err
}

func (d *Database) UpdateUserRole(userID int, role string) error {
	query := `UPDATE users SET role = ? WHERE id = ?`
	_, err := d.db.Exec(query, role, userID)
	return err
}

func (d *Database) UpdateUserPassword(userID int, passwordHash string) error {
	query := `UPDATE users SET password_hash = ? WHERE id = ?`
	_, err := d.db.Exec(query, passwordHash, userID)
	return err
}

func (d *Database) ListUsers() ([]UserRecord, error) {
	rows, err := d.db.Query(`SELECT id, username, password_hash, role, department, created_at FROM users ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]UserRecord, 0)
	for rows.Next() {
		var u UserRecord
		if err := rows.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.Department, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}

	return users, rows.Err()
}

func (d *Database) DeleteUser(userID int) error {
	query := `DELETE FROM users WHERE id = ?`
	_, err := d.db.Exec(query, userID)
	return err
}

func (d *Database) Query(tableName string, where string, args ...interface{}) ([]map[string]interface{}, error) {
	query := fmt.Sprintf("SELECT * FROM `%s`", tableName)
	if where != "" {
		query += " WHERE " + where
	}

	rows, err := d.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	var results []map[string]interface{}
	for rows.Next() {
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range columns {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, err
		}

		rowMap := make(map[string]interface{})
		for i, col := range columns {
			val := values[i]
			b, ok := val.([]byte)
			if ok {
				rowMap[col] = string(b)
			} else {
				rowMap[col] = val
			}
		}

		results = append(results, rowMap)
	}

	return results, rows.Err()
}

// TableColumns returns all column names for a table.
func (d *Database) TableColumns(tableName string) []string {
	return d.getTableColumns(tableName)
}

// QueryRowsLimited queries selected columns with a hard row limit.
func (d *Database) QueryRowsLimited(tableName string, columns []string, limit int) ([]map[string]interface{}, error) {
	if limit <= 0 {
		limit = 10000
	}

	selected := "*"
	if len(columns) > 0 {
		safeCols := make([]string, 0, len(columns))
		for _, c := range columns {
			trimmed := strings.TrimSpace(c)
			if trimmed == "" {
				continue
			}
			safeCols = append(safeCols, fmt.Sprintf("`%s`", strings.ReplaceAll(trimmed, "`", "")))
		}
		if len(safeCols) > 0 {
			selected = strings.Join(safeCols, ", ")
		}
	}

	query := fmt.Sprintf("SELECT %s FROM `%s` ORDER BY id DESC LIMIT ?", selected, strings.ReplaceAll(tableName, "`", ""))
	rows, err := d.db.Query(query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	results := make([]map[string]interface{}, 0)
	for rows.Next() {
		values := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range cols {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}

		m := make(map[string]interface{}, len(cols))
		for i, col := range cols {
			if b, ok := values[i].([]byte); ok {
				m[col] = string(b)
			} else {
				m[col] = values[i]
			}
		}
		results = append(results, m)
	}

	return results, rows.Err()
}

// ExportToCSV 将表单数据导出为 CSV 文件
func (d *Database) ExportToCSV(tableName string, fields []FieldInfo, outputPath string) error {
	// 构建查询所有字段的 SQL
	columns := make([]string, len(fields))
	for i, f := range fields {
		columns[i] = fmt.Sprintf("`%s`", f.Name)
	}

	query := fmt.Sprintf("SELECT %s, _submitted_at, _ip FROM `%s` ORDER BY _submitted_at DESC",
		strings.Join(columns, ", "), tableName)

	rows, err := d.db.Query(query)
	if err != nil {
		return fmt.Errorf("查询数据失败：%v", err)
	}
	defer rows.Close()

	// 创建 CSV 文件
	file, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("创建文件失败：%v", err)
	}
	defer file.Close()

	// 写入 BOM 以支持 Excel 正确识别 UTF-8
	file.WriteString("\xef\xbb\xbf")

	writer := csv.NewWriter(file)
	defer writer.Flush()

	// 写入表头（使用中文标签）
	headers := make([]string, 0)
	for _, f := range fields {
		headers = append(headers, f.Label)
	}
	headers = append(headers, "提交时间", "IP 地址")

	if err := writer.Write(headers); err != nil {
		return fmt.Errorf("写入表头失败：%v", err)
	}

	// 写入数据行
	for rows.Next() {
		values := make([]interface{}, len(fields)+2) // 字段 + 系统字段
		valuePtrs := make([]interface{}, len(fields)+2)
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			return fmt.Errorf("扫描行失败：%v", err)
		}

		row := make([]string, len(values))
		for i, val := range values {
			if val == nil {
				row[i] = ""
			} else if b, ok := val.([]byte); ok {
				row[i] = string(b)
			} else {
				row[i] = fmt.Sprintf("%v", val)
			}
		}

		if err := writer.Write(row); err != nil {
			return fmt.Errorf("写入行失败：%v", err)
		}
	}

	return rows.Err()
}

// GetAllData 获取表单的所有数据（用于 API 返回）
func (d *Database) GetAllData(tableName string, fields []FieldInfo) ([]map[string]interface{}, error) {
	return d.Query(tableName, "", nil)
}

// GetCount 获取表中的数据条数
func (d *Database) GetCount(tableName string) (int64, error) {
	query := fmt.Sprintf("SELECT COUNT(*) FROM `%s`", tableName)
	var count int64
	err := d.db.QueryRow(query).Scan(&count)
	return count, err
}

func (d *Database) EnsureShareLinkTable() error {
	query := `CREATE TABLE IF NOT EXISTS form_share_links (
		token TEXT PRIMARY KEY,
		form_name TEXT NOT NULL,
		created_by INTEGER NOT NULL,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`
	_, err := d.db.Exec(query)
	return err
}

func (d *Database) CreateShareLink(token, formName string, createdBy int) error {
	if err := d.EnsureShareLinkTable(); err != nil {
		return err
	}

	query := `INSERT INTO form_share_links (token, form_name, created_by, created_at) VALUES (?, ?, ?, datetime('now'))`
	_, err := d.db.Exec(query, token, formName, createdBy)
	return err
}

func (d *Database) GetShareLink(token string) (*ShareLinkRecord, error) {
	if err := d.EnsureShareLinkTable(); err != nil {
		return nil, err
	}

	query := `SELECT token, form_name, created_by, created_at FROM form_share_links WHERE token = ? LIMIT 1`
	var rec ShareLinkRecord
	err := d.db.QueryRow(query, token).Scan(&rec.Token, &rec.FormName, &rec.CreatedBy, &rec.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &rec, nil
}
