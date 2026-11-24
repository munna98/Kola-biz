import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { setNeedsCompanySetup, setCompanyProfile } from '@/store';

// Mark that company setup is complete
import { toast } from 'sonner';
import { IconBuilding, IconMapPin, IconPhone, IconWorld } from '@tabler/icons-react';
import { Cloud } from 'lucide-react';
import ConnectCloudCompanyDialog from '@/components/dialogs/ConnectCloudCompanyDialog';

interface Country {
    id: number;
    name: string;
    code: string;
}

export default function CompanySetupPage() {
    const dispatch = useDispatch();
    const [countries, setCountries] = useState<Country[]>([]);
    const [formData, setFormData] = useState({
        companyName: '',
        country: 'India',
        addressLine1: '',
        phone: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [showConnectCloud, setShowConnectCloud] = useState(false);

    const handleCloudConnected = async (res: any) => {
        dispatch(setNeedsCompanySetup(false));
        const profile: any = await invoke('get_company_profile').catch(() => null);
        if (profile) {
            dispatch(setCompanyProfile(profile));
        }
        toast.success(`Connected to "${res.company_name}" from cloud! Setup skipped.`);
    };

    // Load countries on mount
    useEffect(() => {
        const loadCountries = async () => {
            try {
                const countriesList: Country[] = await invoke('get_countries');
                setCountries(countriesList);
            } catch (error) {
                console.error('Failed to load countries:', error);
                toast.error('Failed to load countries');
            }
        };
        loadCountries();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!formData.companyName.trim()) {
            toast.error('Company name is required');
            return;
        }
        if (!formData.country) {
            toast.error('Country is required');
            return;
        }

        setIsLoading(true);

        try {
            await invoke('update_company_profile', {
                profile: {
                    company_name: formData.companyName.trim(),
                    country: formData.country,
                    address_line1: formData.addressLine1.trim() || null,
                    phone: formData.phone.trim() || null,
                },
            });

            toast.success('Company profile saved successfully!');

            // Mark that company setup is complete
            dispatch(setNeedsCompanySetup(false));
        } catch (error: any) {
            toast.error(error?.message || 'Failed to save company profile');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="space-y-2 text-center">
                    <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <IconBuilding className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-3xl font-bold">Company Setup</CardTitle>
                    <CardDescription className="text-base">
                        Let's set up your company profile
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                                Existing Cloud Company?
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                                Skip setup & connect directly to your cloud database
                            </p>
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => setShowConnectCloud(true)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7.5 px-3 shrink-0 gap-1.5"
                        >
                            <Cloud size={13} />
                            Join Cloud
                        </Button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="companyName">Company Name *</Label>
                            <div className="relative">
                                <IconBuilding className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="companyName"
                                    type="text"
                                    placeholder="Enter your company name"
                                    value={formData.companyName}
                                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                                    className="pl-10"
                                    autoFocus
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="country">Country *</Label>
                            <div className="relative">
                                <IconWorld className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                                <Combobox
                                    options={countries.map(c => ({
                                        value: c.name,
                                        label: c.name,
                                        subLabel: c.code,
                                        searchString: `${c.name} ${c.code}`
                                    }))}
                                    value={formData.country}
                                    onChange={(value) => setFormData({ ...formData, country: value as string })}
                                    placeholder="Select country"
                                    searchPlaceholder="Search countries..."
                                    className="pl-10 h-10"
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="addressLine1">Address</Label>
                            <div className="relative">
                                <IconMapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="addressLine1"
                                    type="text"
                                    placeholder="Enter your address"
                                    value={formData.addressLine1}
                                    onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                                    className="pl-10"
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="phone">Mobile Number</Label>
                            <div className="relative">
                                <IconPhone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="phone"
                                    type="tel"
                                    placeholder="Enter mobile number"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="pl-10"
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isLoading}
                        >
                            {isLoading ? 'Saving...' : 'Continue'}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <ConnectCloudCompanyDialog
                open={showConnectCloud}
                onClose={() => setShowConnectCloud(false)}
                onSuccess={handleCloudConnected}
            />
        </div>
    );
}
