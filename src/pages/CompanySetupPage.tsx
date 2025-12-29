import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { setNeedsCompanySetup } from '@/store';

// Mark that company setup is complete
import { toast } from 'sonner';
import { IconBuilding, IconMapPin, IconPhone, IconWorld } from '@tabler/icons-react';

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
                <CardContent>
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
                                <Select
                                    value={formData.country}
                                    onValueChange={(value) => setFormData({ ...formData, country: value })}
                                    disabled={isLoading}
                                >
                                    <SelectTrigger className="pl-10">
                                        <SelectValue placeholder="Select country" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {countries.map((country) => (
                                            <SelectItem key={country.id} value={country.name}>
                                                {country.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
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
        </div>
    );
}
