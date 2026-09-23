from ..extensions import db


class FinancialBudgetLine(db.Model):
    __tablename__ = 'financial_budget_lines'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    chart_account_id = db.Column(db.Integer, db.ForeignKey('chart_accounts.id'), nullable=False, index=True)
    period_year = db.Column(db.Integer, nullable=False, index=True)
    amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    notes = db.Column(db.String(255), nullable=True)

    chart_account = db.relationship('ChartAccount')

    __table_args__ = (db.UniqueConstraint('development_id', 'chart_account_id', 'period_year',
                                          name='uq_budget_line_account_year'),)

