package model

import (
	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

func getTimestampFromDB(db DBLike) int64 {
	var ts int64
	var err error
	switch {
	case common.UsingPostgreSQL:
		err = db.Raw("SELECT EXTRACT(EPOCH FROM NOW())::bigint").Scan(&ts).Error
	case common.UsingSQLite:
		err = db.Raw("SELECT strftime('%s','now')").Scan(&ts).Error
	default:
		err = db.Raw("SELECT UNIX_TIMESTAMP()").Scan(&ts).Error
	}
	if err != nil || ts <= 0 {
		return common.GetTimestamp()
	}
	return ts
}

type DBLike interface {
	Raw(sql string, values ...interface{}) *gorm.DB
}

// GetDBTimestamp returns a UNIX timestamp from database time.
// Falls back to application time on error.
func GetDBTimestamp() int64 {
	return getTimestampFromDB(DB)
}

// GetTxTimestamp returns a UNIX timestamp from the current transaction/connection.
// Falls back to application time on error or nil tx.
func GetTxTimestamp(tx *gorm.DB) int64 {
	if tx == nil {
		return common.GetTimestamp()
	}
	return getTimestampFromDB(tx)
}
