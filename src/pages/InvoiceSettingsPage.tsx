import { InvoiceTemplatesPage } from './settings/InvoiceTemplatesPage';

export default function InvoiceSettingsPage() {
    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="mb-6">
                <h1 className="text-3xl font-bold">Invoice Settings</h1>
                <p className="text-muted-foreground mt-1">
                    Manage your invoice templates and printing preferences
                </p>
            </div>

            <InvoiceTemplatesPage />
        </div>
    );
}
